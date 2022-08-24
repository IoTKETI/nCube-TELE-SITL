# nCube-TELE
Start Guide

### Install dependencies
```shell
$ curl -sL https://deb.nodesource.com/setup_16.x | sudo -E bash -

$ sudo apt-get install -y nodejs

$ node -v

$ git clone https://github.com/IoTKETI/nCube-TELE

$ cd /home/pi/nCube-TELE

$ npm install
```

### Connect with FC (ex. CubePilot Cube Orange)
1. Set FC
   - Serial baudrate : 115200
   - Change parameter
     - SRx: 2hz
     - SYSID_THISMAV: change to a value other than 1
2. Connect MC and FC
   - Connect UART1(/dev/ttyAMA0) of MC and TELEMx of FC via Serial.

### Define Drone ID
```shell
$ nano flight.json
```
```json
{
    "approval_gcs": "MUV",
    "flight": "Dione"
}
```

### Run
```shell
$ node thyme.js
```

### Install `pm2` package
```shell
$ sudo npm install -g pm2

$ pm2 start thyme.js

$ pm2 save 
```
