/* MagicMirror²
 * Module: MMM-YoLink
 *
 * By Gemini
 * Version: 1.10
 */

Module.register("MMM-YoLink", {
    // --- MODULE DEFAULTS ---
    defaults: {
        uaid: "",
        secretKey: "",
        deviceIds: [],
        updateInterval: 5 * 60 * 1000,
        header: "YoLink Sensors",
        tempUnit: "C",
        batteryThreshold: 25,
        showTypes: ["THSensor", "LeakSensor", "DoorSensor", "MotionSensor"],
        excludeIds: [],
        staticDeviceId: null,
        rotationInterval: 10 * 1000,
        // --- ADD v1.10: Option for custom colors ---
        deviceColors: {} // e.g., { "d88b4c040005efe3": "#ff0000" }
    },

    // --- MODULE STATE ---
    sensorData: {},
    error: null,
    isLoading: true,
    rotatingDevices: [],
    rotatingIndex: 0,
    rotationTimer: null,

    // --- MODULE LIFECYCLE METHODS ---
    start: function() {
        Log.info(`[${this.name}] v1.10: Starting module.`);
        if (!this.config.uaid || !this.config.secretKey) {
            this.error = "Configuration Error: Please set your uaid and secretKey.";
            this.updateDom();
            return;
        }
        this.sendSocketNotification("START_FETCH", this.config);
    },

    getStyles: function() {
        return ["MMM-YoLink.css"];
    },

    getHeader: function() {
        return this.config.header;
    },

    // --- RENDER METHOD (getDom) ---
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

        const container = document.createElement("div");
        container.className = "yolink-container";

        // Find the static device
        const staticDevice = this.sensorData[this.config.staticDeviceId];

        if (staticDevice) {
            const staticColumn = document.createElement("div");
            staticColumn.className = "yolink-column";
            staticColumn.appendChild(this.renderDevice(staticDevice));
            container.appendChild(staticColumn);
        }

        // Render the rotating device if there are any
        if (this.rotatingDevices.length > 0) {
            const rotatingColumn = document.createElement("div");
            rotatingColumn.className = "yolink-column";
            const currentRotatingDevice = this.rotatingDevices[this.rotatingIndex];
            if (currentRotatingDevice) {
                rotatingColumn.appendChild(this.renderDevice(currentRotatingDevice));
            }
            container.appendChild(rotatingColumn);
        }
        
        if (!staticDevice && this.rotatingDevices.length === 0) {
             container.innerHTML = "No devices to display.";
        }

        wrapper.appendChild(container);
        return wrapper;
    },

    /**
     * @function renderDevice
     * Renders a single device's data into a table.
     * @param {object} device - The device object from the API.
     * @returns {HTMLElement} A table element with the device's data.
     */
    renderDevice: function(device) {
        const table = document.createElement("table");
        table.className = "small";

        const nameRow = document.createElement("tr");
        const nameCell = document.createElement("td");
        nameCell.className = "deviceName";
        nameCell.colSpan = 2;
        nameCell.innerHTML = device.name;
        
        // *** ADD v1.10: Apply custom color if specified in config ***
        if (this.config.deviceColors[device.deviceId]) {
            nameCell.style.color = this.config.deviceColors[device.deviceId];
        }
        
        nameRow.appendChild(nameCell);
        table.appendChild(nameRow);

        if (device.data && device.data.online === false) {
            this.addStatusRow(table, "Offline");
            return table;
        }

        const liveData = device.data ? device.data.state : null;

        if (liveData && typeof liveData === 'object') {
            this.addDataRow(table, 'Temperature', liveData.temperature);
            if (device.modelName !== "YS8008-UC") {
                this.addDataRow(table, 'Humidity', liveData.humidity);
            }
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
        return table;
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

            const allDevices = Object.values(this.sensorData);
            this.rotatingDevices = allDevices.filter(device => 
                device.deviceId !== this.config.staticDeviceId &&
                this.config.showTypes.includes(device.type) &&
                !this.config.excludeIds.includes(device.deviceId)
            );

            this.scheduleRotation();
            this.updateDom(500);
        } else if (notification === "FETCH_ERROR") {
            this.isLoading = false;
            this.error = payload.error;
            this.updateDom();
        }
    },
    
    // --- ROTATION LOGIC ---
    scheduleRotation: function() {
        if (this.rotationTimer) {
            clearInterval(this.rotationTimer);
        }
        if (this.rotatingDevices.length > 1) {
            this.rotationTimer = setInterval(() => {
                this.rotatingIndex = (this.rotatingIndex + 1) % this.rotatingDevices.length;
                this.updateDom(500);
            }, this.config.rotationInterval);
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
