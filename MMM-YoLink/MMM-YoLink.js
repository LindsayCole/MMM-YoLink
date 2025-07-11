/* MagicMirror²
 * Module: MMM-YoLink
 *
 * By Gemini
 * Version: 1.8
 */

Module.register("MMM-YoLink", {
    // --- MODULE DEFAULTS ---
    defaults: {
        uaid: "", // YoLink User Access ID
        secretKey: "", // YoLink Secret Key
        deviceIds: [], // Optional. If empty, all compatible devices will be shown.
        updateInterval: 5 * 60 * 1000, // 5 minutes in milliseconds
        header: "YoLink Sensors",
        tempUnit: "C", // "C" for Celsius, "F" for Fahrenheit
        batteryThreshold: 25, // Show battery level if it is at or below this percentage.
        showTypes: ["THSensor", "LeakSensor", "DoorSensor", "MotionSensor"], // Show devices of these types
        excludeIds: [] // Hide specific devices by their ID
    },

    // --- MODULE STATE ---
    sensorData: {},
    error: null,
    isLoading: true,

    // --- MODULE LIFECYCLE METHODS ---
    start: function() {
        Log.info(`[${this.name}] v1.8: Starting module.`);
        if (!this.config.uaid || !this.config.secretKey) {
            this.error = "Configuration Error: Please set your uaid and secretKey.";
            Log.error(`[${this.name}] ${this.error}`);
            this.updateDom();
            return;
        }
        this.sendSocketNotification("START_FETCH", this.config);
        this.isLoading = true;
    },

    getStyles: function() {
        return ["MMM-YoLink.css"];
    },

    getHeader: function() {
        return this.config.header;
    },

    getDom: function() {
        const wrapper = document.createElement("div");
        wrapper.className = "yolink-wrapper";

        if (this.error) {
            wrapper.innerHTML = `<div class="error">${this.error}</div>`;
            return wrapper;
        }

        if (this.isLoading) {
            wrapper.innerHTML = "Loading sensor data...";
            wrapper.className += " dimmed light small";
            return wrapper;
        }

        const table = document.createElement("table");
        table.className = "small";

        let devicesToDisplay = Object.values(this.sensorData);

        // 1. Filter by type
        if (this.config.showTypes && this.config.showTypes.length > 0) {
            devicesToDisplay = devicesToDisplay.filter(device => this.config.showTypes.includes(device.type));
        }

        // 2. Filter by excluded IDs
        if (this.config.excludeIds && this.config.excludeIds.length > 0) {
            devicesToDisplay = devicesToDisplay.filter(device => !this.config.excludeIds.includes(device.deviceId));
        }

        if (devicesToDisplay.length === 0) {
            this.addStatusRow(table, "No devices to display.");
        }

        devicesToDisplay.forEach(device => {
            const nameRow = document.createElement("tr");
            const nameCell = document.createElement("td");
            nameCell.className = "deviceName";
            nameCell.colSpan = 2;
            nameCell.innerHTML = device.name;
            nameRow.appendChild(nameCell);
            table.appendChild(nameRow);

            if (device.data && device.data.online === false) {
                this.addStatusRow(table, "Offline");
                return; 
            }

            const liveData = device.data ? device.data.state : null;

            if (liveData && typeof liveData === 'object') {
                this.addDataRow(table, 'Temperature', liveData.temperature);

                // *** ADD v1.8: Only show humidity if it's not the Floating Thermometer ***
                if (device.modelName !== "YS8008-UC") {
                    this.addDataRow(table, 'Humidity', liveData.humidity);
                }
                
                // Handle general 'state' property for sensors like LeakSensor, DoorSensor
                if (liveData.state && !liveData.temperature) {
                    this.addDataRow(table, 'Status', liveData.state);
                }

                if (liveData.battery !== undefined && liveData.battery !== null) {
                    const batteryPercentage = Math.min(parseInt(liveData.battery, 10) * 25, 100);
                    if (batteryPercentage <= this.config.batteryThreshold) {
                        this.addDataRow(table, 'Battery', liveData.battery);
                    }
                }
            } else {
                this.addStatusRow(table, "State not available");
            }
        });

        wrapper.appendChild(table);
        return wrapper;
    },

    // --- HELPER FUNCTIONS for getDom ---
    addStatusRow: function(table, message) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = 2;
        cell.className = "dimmed";
        cell.innerHTML = message;
        row.appendChild(cell);
        table.appendChild(row);
    },

    addDataRow: function(table, key, value) {
        if (value === undefined || value === null) return;
        const row = document.createElement("tr");
        const keyCell = document.createElement("td");
        keyCell.className = "stateKey";
        keyCell.innerHTML = key;
        row.appendChild(keyCell);
        const valueCell = document.createElement("td");
        valueCell.className = "stateValue";
        valueCell.innerHTML = this.formatStateValue(key, value);
        row.appendChild(valueCell);
        table.appendChild(row);
    },

    // --- SOCKET NOTIFICATION HANDLING ---
    socketNotificationReceived: function(notification, payload) {
        if (notification === "SENSOR_DATA") {
            this.isLoading = false;
            this.error = null;
            this.sensorData = payload;
            this.updateDom(500);
        } else if (notification === "FETCH_ERROR") {
            this.isLoading = false;
            this.error = payload.error;
            this.updateDom();
        }
    },

    // --- DATA FORMATTING ---
    formatStateValue: function(key, value) {
        if (key === 'Temperature') {
            let temp = parseFloat(value);
            if (this.config.tempUnit.toUpperCase() === 'F') {
                temp = (temp * 9/5) + 32;
            }
            return `${temp.toFixed(1)} &deg;${this.config.tempUnit.toUpperCase()}`;
        }
        if (key === 'Humidity') {
            return `${parseFloat(value).toFixed(0)}%`;
        }
        if (key === 'Battery') {
            const batteryValue = parseInt(value, 10);
            return `${Math.min(batteryValue * 25, 100)}%`;
        }
        if (typeof value === 'string') {
            return value.charAt(0).toUpperCase() + value.slice(1);
        }
        return value;
    }
});
