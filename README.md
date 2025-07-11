# MMM-YoLink - YoLink Sensors on your MagicMirror²!

This is a module for [MagicMirror²](https://magicmirror.builders/) that displays data from your [YoLink](https://www.yosmart.com/) sensors. After a truly epic journey of trial, error, and some fantastic community-led detective work, it finally works!

### A Friendly Disclaimer

This module was built through sheer persistence and the goodwill of the open-source community. It works for me, and I hope it works for you! However, please consider it a "use at your own risk" project. I can't offer official support, but I'll do my best to help if I can.

---

## Installation

Getting this module up and running is pretty straightforward.

1.  **Navigate to your modules folder:**
    Open a terminal on your Raspberry Pi and go to your MagicMirror modules directory.
    ```bash
    cd ~/MagicMirror/modules
    ```

2.  **Clone the repository:**
    ```bash
    git clone https://github.com/LindsayCole/MMM-YoLink
    ```
    

3.  **Install dependencies:**
    This module needs `node-fetch` to talk to the YoLink servers.
    ```bash
    cd MMM-YoLink
    npm install
    ```

That's it for the installation! Now, let's get it configured.

## Configuration

Add the module to your `~/MagicMirror/config/config.js` file. Here is a sample configuration with all the available options explained.

```javascript
{
    module: "MMM-YoLink",
    position: "top_left", // Or wherever you want it!
    header: "YoLink Sensors",
    config: {
        // --- Required ---
        uaid: "your_uaid_from_the_app",
        secretKey: "your_secretKey_from_the_app",

        // --- Filtering (Choose one method or let it run wild!) ---
        // Option 1: Show specific devices (leave empty to show all)
        deviceIds: [], 
        
        // Option 2: Show devices by type (if deviceIds is empty)
        showTypes: ["THSensor", "LeakSensor", "DoorSensor", "MotionSensor"],

        // Option 3: Hide specific devices (if deviceIds is empty)
        excludeIds: [],

        // --- Customization (Optional) ---
        tempUnit: "C", // "C" for Celsius, "F" for Fahrenheit
        batteryThreshold: 25, // Show battery level only if it's at or below this percentage.
        updateInterval: 5 * 60 * 1000, // How often to fetch data (in ms). Default is 5 minutes.
    }
},
```

### Configuration Options

| Option             | Description                                                                                                                              | Default Value                                                |
| :----------------- | :--------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------- |
| `uaid`             | **Required.** Your User Access ID from the YoLink app.                                                                                   | `""`                                                         |
| `secretKey`        | **Required.** Your Secret Key from the YoLink app.                                                                                       | `""`                                                         |
| `deviceIds`        | An array of specific device ID strings you want to display. If you leave this empty, the module will try to show all compatible devices. | `[]`                                                         |
| `showTypes`        | If `deviceIds` is empty, this will only show devices of the types you list here (e.g., "THSensor").                                        | `["THSensor", "LeakSensor", "DoorSensor", "MotionSensor"]`   |
| `excludeIds`       | If `deviceIds` is empty, this lets you hide specific devices by their ID. Useful for hiding a Hub or a device you don't need to see.       | `[]`                                                         |
| `tempUnit`         | The unit to display for temperature. Can be `"C"` or `"F"`.                                                                              | `"C"`                                                        |
| `batteryThreshold` | The module will only display the battery level if it is at or below this percentage. Set to `100` to always show it.                      | `25`                                                         |
| `updateInterval`   | How often the module should ask YoLink for new data, in milliseconds.                                                                    | `300000` (5 minutes)                                         |

---

Enjoy your new sensor display!
