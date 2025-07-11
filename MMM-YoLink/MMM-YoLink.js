/* MagicMirror²
 * Module: MMM-YoLink
 *
 * By Gemini
 * Version: 1.19
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
        hotTubTempDrop: 5,
        debug: false // Set to true in config to show diagnostic info
    },

    // --- MODULE STATE ---
    sensorData: {},
    error: null,
    isLoading: true,
    rotatingDevices: [],
    rotatingIndex: 0,
    rotationTimer: null,
    previousTemperatures: {},

    // --- MODULE LIFECYCLE METHODS ---
    start: function() {
        Log.info(`[${this.name}] v1.19: Starting module.`);
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

        const container = document.createElement("div");
        container.className = "yolink-container";
        
        const allDevices = Object.values(this.sensorData).filter(device => 
            this.config.showTypes.includes(device.type) &&
            !this.config.excludeIds.includes(device.deviceId)
        );

        const staticDevice = allDevices.find(d => d.deviceId === this.config.staticDeviceId);
        this.rotatingDevices = allDevices.filter(d => d.deviceId !== this.config.staticDeviceId);

        // --- ADD v1.19: Diagnostic Debug Mode ---
        if (this.config.debug) {
            const debugInfo = document.createElement("div");
            debugInfo.style.textAlign = 'left';
            debugInfo.style.border = '1px solid white';
            debugInfo.style.padding = '5px';
            debugInfo.style.marginBottom = '10px';
            debugInfo.innerHTML = `
                <p style="margin:0; padding:0;">--- MMM-YoLink Debug ---</p>
                <p style="margin:0; padding:0;">Total devices in sensorData: ${Object.keys(this.sensorData).length}</p>
                <p style="margin:0; padding:0;">Total devices after filtering: ${allDevices.length}</p>
                <p style="margin:0; padding:0;">Static device found: ${staticDevice ? staticDevice.name : 'No'}</p>
                <p style="margin:0; padding:0;">Rotating devices count: ${this.rotatingDevices.length}</p>
                <p style="margin:0; padding:0;">Current rotating index: ${this.rotatingIndex}</p>
            `;
            wrapper.appendChild(debugInfo);
        }

        // Render the static column
        if (staticDevice) {
            const staticColumn = document.createElement("div");
            staticColumn.className = "yolink-column yolink-static-column";
            staticColumn.appendChild(this.renderDevice(staticDevice));
            container.appendChild(staticColumn);
        }
        
        // Render the rotating column
        if (this.rotatingDevices.length > 0) {
            const rotatingColumn = document.createElement("div");
            rotatingColumn.className = "yolink-column yolink-rotating-column";
            if (this.rotatingIndex >= this.rotatingDevices.length) {
                this.rotatingIndex = 0;
            }
            const currentRotatingDevice = this.rotatingDevices[this.rotatingIndex];
            if (currentRotatingDevice) {
                rotatingColumn.appendChild(this.renderDevice(currentRotatingDevice));
            }
            container.appendChild(rotatingColumn);
        }
        
        if (container.children.length === 0) {
             container.innerHTML = "No devices to display.";
        }

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
            this.updateDom(500);
            this.scheduleRotation();
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
        
        if (this.rotatingDevices && this.rotatingDevices.length > 1) {
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
