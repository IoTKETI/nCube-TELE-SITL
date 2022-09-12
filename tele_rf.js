/**
 * Created by Wonseok Jung in KETI on 2020-08-02.
 */
const {SerialPort} = require('serialport')
const mqtt = require("mqtt")
const {nanoid} = require("nanoid")
const fs = require("fs")
const {exec, spawn} = require("child_process");

let conf = JSON.parse(process.env.conf)

let rfPort = null
var rfPortNum = '/dev/ttyAMA1'
var rfBaudrate = '115200'

let local_mqtt_client = null

let pub_gcs_topic = '/TELE/gcs/rf'
let sub_drone_topic = '/TELE/drone'
let sub_sortie_topic = '/TELE/sorite'

let my_sortie_name = 'disarm'

setTimeout(init, 2000)

function init() {
    let drone_info = {}
    // TODO: LTE 없어서 drone_info 업데이트 안되는 경우
    try {
        drone_info = JSON.parse(fs.readFileSync('drone_info.json', 'utf8'))
    } catch (e) {
        console.log('can not find drone_info.json file')
        drone_info.host = "gcs.iotocean.org"
        drone_info.drone = "drone1"
        drone_info.gcs = "KETI_MUV"
        drone_info.type = "ardupilot"
        drone_info.system_id = 251
        drone_info.update = "disable"
        drone_info.rf = {}
        drone_info.rf.drone = "/dev/ttyAMA1"
        drone_info.rf.rc = "/dev/ttyAMA2"
        drone_info.mission = {}
        drone_info.id = conf.ae.name
        fs.writeFileSync('drone_info.json', JSON.stringify(drone_info, null, 4), 'utf8')
    }

    try {  // run default mission of lte
        if (fs.existsSync('./msw_lte_msw_lte')) {
            setTimeout(fork_msw, 10, 'msw_lte', 'msw_lte_msw_lte');
        }
    } catch (e) {
        console.log(e.message);
    }
    // TODO: 데이터 송수신용 RF serial 포트 하나 더 오픈?
    if (drone_info.hasOwnProperty('mission')) {
        for (var mission_name in drone_info.mission) {
            if (drone_info.mission.hasOwnProperty(mission_name)) {
                let chk_cnt = 'git'
                if (drone_info.mission[mission_name].hasOwnProperty(chk_cnt)) {
                    try {
                        var repo_arr = drone_info.mission[mission_name][chk_cnt].split('/');
                        var directory_name = mission_name + '_' + repo_arr[repo_arr.length - 1].replace('.git', '');

                        if (fs.existsSync('./' + directory_name)) {
                            setTimeout(fork_msw, 10, mission_name, directory_name);
                        }
                    } catch (e) {
                        console.log(e.message);
                    }
                }
            }
        }
    }
    setTimeout(rfPortOpening, parseInt(Math.random() * 5));
}

function npm_install(mission_name, directory_name) {
    try {
        if (process.platform === 'win32') {
            var cmd = 'npm.cmd'
        } else {
            cmd = 'npm'
        }

        var npmInstall = spawn(cmd, ['install'], {cwd: process.cwd() + '/' + directory_name});

        npmInstall.stdout.on('data', function (data) {
            console.log('stdout: ' + data);
        });

        npmInstall.stderr.on('data', function (data) {
            console.log('stderr: ' + data);
        });

        npmInstall.on('exit', function (code) {
            console.log('exit: ' + code);

            setTimeout(fork_msw, 10, mission_name, directory_name)
        });

        npmInstall.on('error', function (code) {
            console.log('error: ' + code);

            setTimeout(npm_install, 10, mission_name, directory_name);
        });
    } catch (e) {
        console.log(e.message);
    }
}

function fork_msw(mission_name, directory_name) {
    var executable_name = directory_name.replace(mission_name + '_', '');

    var nodeMsw = exec('sh ' + executable_name + '.sh', {cwd: process.cwd() + '/' + directory_name});

    nodeMsw.stdout.on('data', function (data) {
        console.log('stdout: ' + data);
    });

    nodeMsw.stderr.on('data', function (data) {
        console.log('stderr: ' + data);
    });

    nodeMsw.on('exit', function (code) {
        console.log('exit: ' + code);
    });

    nodeMsw.on('error', function (code) {
        console.log('error: ' + code);

        setTimeout(npm_install, 10, directory_name);
    });
}

function rfPortOpening() {
    if (rfPort === null) {
        rfPort = new SerialPort({
            path: rfPortNum,
            baudRate: parseInt(rfBaudrate, 10),
        })

        rfPort.on('open', rfPortOpen)
        rfPort.on('close', rfPortClose)
        rfPort.on('error', rfPortError)
        rfPort.on('data', rfPortData)
    } else {
        if (rfPort.isOpen) {

        } else {
            rfPort.open()
        }
    }
}

function rfPortOpen() {
    console.log('rfPort(' + rfPort.path + '), rfPort rate: ' + rfPort.baudRate + ' open.')
    local_mqtt_connect('localhost')
}

function rfPortClose() {
    console.log('rfPort closed.')

    setTimeout(rfPortOpening, 2000)
}

function rfPortError(error) {
    console.log('[rfPort error]: ' + error.message)

    setTimeout(rfPortOpening, 2000)
}

var mavStrFromDrone = ''
var mavStrFromDroneLength = 0
var mavVersion = 'unknown'
var mavVersionCheckFlag = false

function rfPortData(data) {  // GCS 데이터 로컬 MQTT로 전달
    mavStrFromDrone += data.toString('hex').toLowerCase()

    while (mavStrFromDrone.length > 20) {
        if (!mavVersionCheckFlag) {
            let stx = mavStrFromDrone.substring(0, 2)
            if (stx === 'fe') {
                var len = parseInt(mavStrFromDrone.substring(2, 4), 16)
                var mavLength = (6 * 2) + (len * 2) + (2 * 2)
                var sysid = parseInt(mavStrFromDrone.substring(6, 8), 16)
                var msgid = parseInt(mavStrFromDrone.substring(10, 12), 16)

                if (msgid === 0 && len === 9) { // HEARTBEAT
                    mavVersionCheckFlag = true
                    mavVersion = 'v1'
                }

                if ((mavStrFromDrone.length) >= mavLength) {
                    var mavPacket = mavStrFromDrone.substring(0, mavLength)

                    if (local_mqtt_client !== null) {
                        local_mqtt_client.publish(pub_gcs_topic, Buffer.from(mavPacket, 'hex'))
                    }
                    mavStrFromDrone = mavStrFromDrone.substring(mavLength)
                    mavStrFromDroneLength = 0
                } else {
                    break
                }
            } else if (stx === 'fd') {
                len = parseInt(mavStrFromDrone.substring(2, 4), 16)
                mavLength = (10 * 2) + (len * 2) + (2 * 2)

                sysid = parseInt(mavStrFromDrone.substring(10, 12), 16)
                msgid = parseInt(mavStrFromDrone.substring(18, 20) + mavStrFromDrone.substring(16, 18) + mavStrFromDrone.substring(14, 16), 16)

                if (msgid === 0 && len === 9) { // HEARTBEAT
                    mavVersionCheckFlag = true
                    mavVersion = 'v2'
                }
                if (mavStrFromDrone.length >= mavLength) {
                    mavPacket = mavStrFromDrone.substring(0, mavLength)

                    if (local_mqtt_client !== null) {
                        local_mqtt_client.publish(pub_gcs_topic, Buffer.from(mavPacket, 'hex'))
                    }
                    mavStrFromDrone = mavStrFromDrone.substring(mavLength)
                    mavStrFromDroneLength = 0
                } else {
                    break
                }
            } else {
                mavStrFromDrone = mavStrFromDrone.substring(2)
            }
        } else {
            let stx = mavStrFromDrone.substring(0, 2)
            if (mavVersion === 'v1' && stx === 'fe') {
                len = parseInt(mavStrFromDrone.substring(2, 4), 16)
                mavLength = (6 * 2) + (len * 2) + (2 * 2)

                if ((mavStrFromDrone.length) >= mavLength) {
                    mavPacket = mavStrFromDrone.substring(0, mavLength)
                    // console.log('v1', mavPacket)

                    if (local_mqtt_client !== null) {
                        local_mqtt_client.publish(pub_gcs_topic, Buffer.from(mavPacket, 'hex'))
                    }
                    mavStrFromDrone = mavStrFromDrone.substring(mavLength)
                    mavStrFromDroneLength = 0
                } else {
                    break
                }
            } else if (mavVersion === 'v2' && stx === 'fd') {
                len = parseInt(mavStrFromDrone.substring(2, 4), 16)
                mavLength = (10 * 2) + (len * 2) + (2 * 2)

                if (mavStrFromDrone.length >= mavLength) {
                    mavPacket = mavStrFromDrone.substring(0, mavLength)
                    // console.log('v2', mavPacket)

                    if (local_mqtt_client !== null) {
                        local_mqtt_client.publish(pub_gcs_topic, Buffer.from(mavPacket, 'hex'))
                    }

                    mavStrFromDrone = mavStrFromDrone.substring(mavLength)
                    mavStrFromDroneLength = 0
                } else {
                    break
                }
            } else {
                mavStrFromDrone = mavStrFromDrone.substring(2)
            }
        }
    }
}

function local_mqtt_connect(serverip) {
    if (local_mqtt_client === null) {
        if (conf.usesecure === 'disable') {
            var connectOptions = {
                host: serverip,
                port: conf.cse.mqttport,
                protocol: "mqtt",
                keepalive: 10,
                clientId: 'TELE_RF_' + nanoid(15),
                protocolId: "MQTT",
                protocolVersion: 4,
                clean: true,
                reconnectPeriod: 2000,
                connectTimeout: 2000,
                rejectUnauthorized: false
            }
        } else {
            connectOptions = {
                host: serverip,
                port: conf.cse.mqttport,
                protocol: "mqtts",
                keepalive: 10,
                clientId: 'TELE_RF_' + nanoid(15),
                protocolId: "MQTT",
                protocolVersion: 4,
                clean: true,
                reconnectPeriod: 2000,
                connectTimeout: 2000,
                key: fs.readFileSync("./server-key.pem"),
                cert: fs.readFileSync("./server-crt.pem"),
                rejectUnauthorized: false
            }
        }

        local_mqtt_client = mqtt.connect(connectOptions)

        local_mqtt_client.on('connect', function () {
            console.log('local_mqtt is connected')

            if (sub_drone_topic !== '') {
                local_mqtt_client.subscribe(sub_drone_topic, function () {
                    console.log('[local_mqtt] sub_drone_topic is subscribed: ' + sub_drone_topic)
                })
            }
            if (sub_sortie_topic !== '') {
                local_mqtt_client.subscribe(sub_sortie_topic, function () {
                    console.log('[local_mqtt] sub_sortie_topic is subscribed: ' + sub_sortie_topic)
                })
            }
        })

        local_mqtt_client.on('message', function (topic, message) {
            if (topic === sub_sortie_topic) {
                my_sortie_name = message.toString()
            } else if (topic === sub_drone_topic) {
                if (rfPort !== null) {
                    if (rfPort.isOpen) {
                        rfPort.write(Buffer.from(message.toString(), 'hex'))
                    }
                }
            }
        })

        local_mqtt_client.on('error', function (err) {
            console.log('[local_mqtt] (error) ' + err.message)
        })
    }
}
