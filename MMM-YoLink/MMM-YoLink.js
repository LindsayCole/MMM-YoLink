/* MagicMirror²
 * Module: MMM-YoLink
 *
 * By Gemini
 * Version: 1.20
 */

Module.register("MMM-YoLink", {
    // --- MODULE DEFAULTS ---
    defaults: {
        uaid: "",
        secretKey: "",
        deviceIds: [],
        updateInterval: 5 * 60 * 1000,
        tempUnit: "C",
        batteryThreshold: 25,
        showTypes: ["THSensor", "LeakSensor", "DoorSensor", "MotionSensor"],
        excludeIds: [],
        staticDeviceId: null,
        rotationInterval: 10 * 1000,
        deviceColors: {},
        hotTubDeviceId: null,
        hotTubTempDrop: 5
    },

    // --- MODULE STATE ---
    sensorData: {},
    error: null,
    isLoading: true,
    rotatingDevices: [],
    rotatingIndex: 0,
    rotationTimer: null,
    previousTemperatures: {},
    // --- ADD v1.20: Persistent DOM elements for smooth updates ---
    staticColumn: null,
    rotatingColumn: null,

    // --- MODULE LIFECYCLE METHODS ---
    start: function() {
        Log.info(`[${this.name}] v1.20: Starting module.`);
        if (!this.config.uaid || !this.config.secretKey) {
            this.error = "Configuration Error: Please set your uaid and secretKey.";
            this.updateDom();
            return;
        }
        this.isLoading = true;
        this.sendSocketNotification("START_FETCH", this.config);
    },

    getStyles: function() {
        return ["MMM-YoLink.css"];
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

        // --- REWRITE v1.20: Create persistent columns on first run ---
        const container = document.createElement("div");
        container.className = "yolink-container";
        
        // Create the static column div if it doesn't exist
        if (!this.staticColumn) {
            this.staticColumn = document.createElement("div");
            this.staticColumn.className = "yolink-column yolink-static-column";
        }
        
        // Create the rotating column div if it doesn't exist
        if (!this.rotatingColumn) {
            this.rotatingColumn = document.createElement("div");
            this.rotatingColumn.className = "yolink-column yolink-rotating-column";
        }

        // Always attach the persistent columns
        container.appendChild(this.staticColumn);
        container.appendChild(this.rotatingColumn);
        
        // Populate the columns with the latest data
        this.updateDisplayContent();

        wrapper.appendChild(container);
        return wrapper;
    },

    /**
     * @function renderDevice
     * Renders a single device's data into a table.
     */
    renderDevice: function(device) {
        const table = document.createElement("table");
        table.className = `small yolink-device-table yolink-type-${device.type}`;

        const nameRow = document.createElement("tr");
        const nameCell = document.createElement("td");
        nameCell.className = "deviceName";
        nameCell.colSpan = 2;
        nameCell.innerHTML = device.name;
        
        const isRotating = device.deviceId !== this.config.staticDeviceId;
        const staticColor = this.config.deviceColors[this.config.staticDeviceId];

        if (isRotating && staticColor) {
            nameCell.style.color = staticColor;
        } else if (this.config.deviceColors[device.deviceId]) {
            nameCell.style.color = this.config.deviceColors[device.deviceId];
        }
        
        nameRow.appendChild(nameCell);
        table.appendChild(nameRow);

        const liveData = device.data ? device.data.state : null;

        if (liveData && typeof liveData === 'object') {
            let tempAlert = false;
            if (device.deviceId === this.config.hotTubDeviceId) {
                const currentTemp = liveData.temperature;
                const previousTemp = this.previousTemperatures[device.deviceId];
                if (previousTemp !== undefined && currentTemp < previousTemp - this.config.hotTubTempDrop) {
                    tempAlert = true;
                    nameCell.classList.add("temp-alert-name");
                }
            }

            this.addDataRow(table, 'Temperature', liveData.temperature, tempAlert);
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

    addDataRow: function(table, key, value, isAlert = false) {
        if (value === undefined || value === null) return;
        const row = document.createElement("tr");
        const keyCell = document.createElement("td");
        keyCell.className = "stateKey";
        keyCell.innerHTML = key;
        row.appendChild(keyCell);
        const valueCell = document.createElement("td");
        valueCell.className = "stateValue";
        if (isAlert) {
            valueCell.classList.add("temp-alert-value");
        }
        valueCell.innerHTML = this.formatStateValue(key, value);
        row.appendChild(valueCell);
        table.appendChild(row);
    },

    // --- SOCKET NOTIFICATION HANDLING ---
    socketNotificationReceived: function(notification, payload) {
        if (notification === "SENSOR_DATA") {
            this.isLoading = false;
            this.error = null;
            
            for (const deviceId in this.sensorData) {
                if (this.sensorData[deviceId].data && this.sensorData[deviceId].data.state) {
                    this.previousTemperatures[deviceId] = this.sensorData[deviceId].data.state.temperature;
                }
            }

            this.sensorData = payload;
            this.updateDom(250); // Redraw the whole module on new data fetch
            this.scheduleRotation();
        } else if (notification === "FETCH_ERROR") {
            this.isLoading = false;
            this.error = payload.error;
            this.updateDom();
        }
    },
    
    // --- DISPLAY UPDATE & ROTATION LOGIC ---
    updateDisplayContent: function() {
        if (!this.staticColumn || !this.rotatingColumn) return;

        const allDevices = Object.values(this.sensorData).filter(device => 
            this.config.showTypes.includes(device.type) &&
            !this.config.excludeIds.includes(device.deviceId)
        );

        const staticDevice = allDevices.find(d => d.deviceId === this.config.staticDeviceId);
        this.rotatingDevices = allDevices.filter(d => d.deviceId !== this.config.staticDeviceId);
        
        // Update static column content
        this.staticColumn.innerHTML = "";
        if (staticDevice) {
            this.staticColumn.appendChild(this.renderDevice(staticDevice));
        }

        // Update rotating column content
        this.updateRotatingColumn();
    },
    
    updateRotatingColumn: function() {
        if (!this.rotatingColumn) return;

        this.rotatingColumn.innerHTML = "";
        if (this.rotatingDevices.length > 0) {
            if (this.rotatingIndex >= this.rotatingDevices.length) {
                this.rotatingIndex = 0;
            }
            const currentDevice = this.rotatingDevices[this.rotatingIndex];
            if (currentDevice) {
                this.rotatingColumn.appendChild(this.renderDevice(currentDevice));
            }
        }
    },

    scheduleRotation: function() {
        if (this.rotationTimer) {
            clearInterval(this.rotationTimer);
        }
        
        if (this.rotatingDevices && this.rotatingDevices.length > 1) {
            this.rotationTimer = setInterval(() => {
                this.rotatingIndex = (this.rotatingIndex + 1) % this.rotatingDevices.length;
                this.updateRotatingColumn(); // This only updates the rotating column's content
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
