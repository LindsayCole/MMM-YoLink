/* MagicMirror²
 * Node Helper: MMM-YoLink
 *
 * By Gemini
 * Version: 5.1
 */

const NodeHelper = require("node_helper");
const Log = require("logger");

module.exports = NodeHelper.create({
    // --- HELPER STATE ---
    config: null,
    accessToken: null,
    tokenExpireTime: 0,
    fetcher: null,
    apiBaseUrl: "https://api.yosmart.com",

    /**
     * @function start
     * This function is called when the helper is started.
     */
    start: function() {
        Log.info(`[${this.name}] v5.1: Node helper started.`);
        this.fetcher = null;
    },

    /**
     * @function socketNotificationReceived
     * This function is called when a notification is received from the main module file.
     */
    socketNotificationReceived: function(notification, payload) {
        if (notification === "START_FETCH") {
            Log.info(`[${this.name}] Received START_FETCH. Initializing...`);
            this.config = payload;
            
            if (this.fetcher) {
                clearInterval(this.fetcher);
            }
            this.scheduleFetches();
        }
    },

    /**
     * @function scheduleFetches
     * Schedules the periodic fetching of data from the YoLink API.
     */
    scheduleFetches: async function() {
        Log.info(`[${this.name}] Scheduling data fetch every ${this.config.updateInterval}ms.`);
        
        const fetchData = async () => {
            try {
                await this.fetchAllDeviceData();
            } catch (error) {
                Log.error(`[${this.name}] A critical error occurred during fetch:`, error.message);
                this.sendSocketNotification("FETCH_ERROR", { error: "A critical error occurred. Check logs." });
            }
        };

        fetchData(); // Fetch immediately on start
        this.fetcher = setInterval(fetchData, this.config.updateInterval);
    },

    /**
     * @function getAccessToken
     * Authenticates with the YoLink API to get an access token.
     */
    getAccessToken: async function() {
        if (this.accessToken && Date.now() < this.tokenExpireTime) {
            return this.accessToken;
        }

        Log.info(`[${this.name}] Requesting new token...`);
        const { default: fetch } = await import('node-fetch');
        const API_URL = `${this.apiBaseUrl}/open/yolink/token`;
        const bodyPayload = `grant_type=client_credentials&client_id=${encodeURIComponent(this.config.uaid)}&client_secret=${encodeURIComponent(this.config.secretKey)}`;

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: bodyPayload
            });
            const data = await response.json();

            if (data.access_token) {
                this.accessToken = data.access_token;
                this.tokenExpireTime = Date.now() + (data.expires_in * 1000 * 0.9);
                Log.info(`[${this.name}] Successfully obtained new access token.`);
                return this.accessToken;
            } else {
                throw new Error(data.desc || `YoLink Auth Error (Code: ${data.code})`);
            }
        } catch (error) {
            Log.error(`[${this.name}] Failed to get access token:`, error.message);
            this.sendSocketNotification("FETCH_ERROR", { error: "Authentication Failed. Check logs." });
            return null;
        }
    },

    /**
     * @function fetchAllDeviceData
     * Fetches the list of devices and then fetches the state for each one.
     */
    fetchAllDeviceData: async function() {
        Log.info(`[${this.name}] Starting full device data refresh.`);
        const token = await this.getAccessToken();
        if (!token) return;

        const { default: fetch } = await import('node-fetch');
        const API_URL = `${this.apiBaseUrl}/open/yolink/v2/api`;

        try {
            // Step 1: Get the list of all devices
            const listRequestBody = { 
                method: "Home.getDeviceList",
                time: Date.now()
            };
            const listResponse = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(listRequestBody)
            });
            const listResult = await listResponse.json();

            if (listResult.code !== "000000" || !listResult.data || !listResult.data.devices) {
                throw new Error(listResult.desc || `YoLink API Error getting device list: ${JSON.stringify(listResult)}`);
            }
            
            const devicesFromApi = listResult.data.devices;
            Log.info(`[${this.name}] Successfully fetched ${devicesFromApi.length} devices from API.`);

            // *** ADD v5.1: If deviceIds is empty in config, use all devices. Otherwise, filter. ***
            let devicesToFetch;
            if (this.config.deviceIds && this.config.deviceIds.length > 0) {
                Log.info(`[${this.name}] Filtering based on deviceIds in config.`);
                devicesToFetch = devicesFromApi.filter(device => this.config.deviceIds.includes(device.deviceId));
            } else {
                Log.info(`[${this.name}] No deviceIds in config, fetching state for all devices.`);
                devicesToFetch = devicesFromApi;
            }
            
            if (devicesToFetch.length === 0) {
                 this.sendSocketNotification("FETCH_ERROR", { error: "No matching devices found." });
                 return;
            }
            
            Log.info(`[${this.name}] Fetching detailed state for ${devicesToFetch.length} devices.`);
            const allDeviceData = {};

            for (const device of devicesToFetch) {
                const stateMethod = `${device.type}.getState`;
                const stateRequestBody = {
                    method: stateMethod,
                    targetDevice: device.deviceId,
                    token: device.token,
                    time: Date.now()
                };

                const stateResponse = await fetch(API_URL, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(stateRequestBody)
                });
                const stateResult = await stateResponse.json();
                
                if (stateResult.code === "000000" && stateResult.data) {
                    const finalDeviceObject = { ...device, data: { ...device.data, ...stateResult.data } };
                    allDeviceData[device.deviceId] = finalDeviceObject;
                } else {
                    Log.warn(`[${this.name}] Could not fetch state for ${device.name}: ${stateResult.desc}`);
                    allDeviceData[device.deviceId] = device; 
                }
            }

            if (Object.keys(allDeviceData).length > 0) {
                this.sendSocketNotification("SENSOR_DATA", allDeviceData);
            }

        } catch (error) {
            Log.error(`[${this.name}] An error occurred during device data refresh:`, error.message);
            this.sendSocketNotification("FETCH_ERROR", { error: "Could not fetch device data." });
        }
    }
});
