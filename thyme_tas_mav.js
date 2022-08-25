/**
 * Created by Wonseok Jung in KETI on 2020-08-02.
 */

const moment = require('moment')
const fs = require('fs')
const {exec} = require('child_process')
const {SerialPort} = require('serialport')
const mqtt = require("mqtt")
const {nanoid} = require("nanoid")

const mavlink = require('./mavlibrary/mavlink.js')

let conf = JSON.parse(process.env.conf)

let mavPort = null
let mavPortNum = '/dev/ttyAMA0'
let mavBaudrate = '115200'

let local_mqtt_client = null
let sub_gcs_rf_topic = '/TELE/gcs/rf'
let sub_gcs_lte_topic = '/TELE/gcs/lte'
let pub_drone_topic = '/TELE/drone'
let pub_sortie_topic = '/TELE/sorite'
let pub_parse_global_position_int = '/TELE/drone/gpi'
let pub_parse_heartbeat = '/TELE/drone/hb'
let pub_parse_wp_yaw_behavior = '/TELE/drone/wp_yaw_behavior'
let pub_parse_distance_sensor = '/TELE/drone/distance_sensor'

let my_sortie_name = 'disarm'

let GCSData = {}

tas_ready()

function tas_ready() {
    local_mqtt_connect('localhost')
    exec("cat /etc/*release* | grep -w ID | cut -d '=' -f 2", (error, stdout) => {
        if (error) {  // Windows
            console.log('OS is Windows')
            mavPortNum = 'COM13'
            mavBaudrate = '57600'
        }
        if (stdout === "raspbian\n") {  // CROW
            console.log('OS is Raspberry Pi')
            mavPortNum = '/dev/ttyAMA0'
            mavBaudrate = '115200'
        } else if (stdout === "ubuntu\n") {  // KEA
            console.log('OS is Ubuntu')
            mavPortNum = '/dev/ttyTHS0'
            mavBaudrate = '115200'
        }
        mavPortOpening()
    })
}

function gcs_noti_handler(message) {
    // console.log('[GCS]', message)
    var ver = message.substring(0, 2)
    if (ver === 'fd') {
        var msg_id = parseInt(message.substring(18, 20) + message.substring(16, 18) + message.substring(14, 16), 16)
        var base_offset = 20
    } else {
        msg_id = parseInt(message.substring(10, 12).toLowerCase(), 16)
        base_offset = 12
    }

    if (msg_id === mavlink.MAVLINK_MSG_ID_COMMAND_LONG) { // #33
        console.log('[send_reserved_control_command]', message)

        var param1 = Buffer.from(message.substring(base_offset, base_offset + 8).toLowerCase(), 'hex').readFloatLE(0);
        base_offset += 8;
        var param2 = Buffer.from(message.substring(base_offset, base_offset + 8).toLowerCase(), 'hex').readFloatLE(0);
        base_offset += 8;
        var param3 = Buffer.from(message.substring(base_offset, base_offset + 8).toLowerCase(), 'hex').readFloatLE(0);
        base_offset += 8;
        var param4 = Buffer.from(message.substring(base_offset, base_offset + 8).toLowerCase(), 'hex').readFloatLE(0);
        base_offset += 8;
        var param5 = Buffer.from(message.substring(base_offset, base_offset + 8).toLowerCase(), 'hex').readFloatLE(0);
        base_offset += 8;
        var param6 = Buffer.from(message.substring(base_offset, base_offset + 8).toLowerCase(), 'hex').readFloatLE(0);
        base_offset += 8;
        var param7 = Buffer.from(message.substring(base_offset, base_offset + 8).toLowerCase(), 'hex').readFloatLE(0);
        base_offset += 8;
        var command = Buffer.from(message.substring(base_offset, base_offset + 4).toLowerCase(), 'hex').readUInt16LE(0);
        base_offset += 4;
        var target_system = Buffer.from(message.substring(base_offset, base_offset + 2).toLowerCase(), 'hex').readUInt8(0);
        base_offset += 2;
        var target_component = Buffer.from(message.substring(base_offset, base_offset + 2).toLowerCase(), 'hex').readUInt8(0);
        base_offset += 2;
        var confirmation = Buffer.from(message.substring(base_offset, base_offset + 2).toLowerCase(), 'hex').readUInt8(0);

        let control_channels = {}
        control_channels.channel = param1
        control_channels.value = param2

        local_mqtt_client.publish('/Control', JSON.stringify(control_channels))
        console.log('============================================================')
        console.log('target_system - ' + target_system)
        console.log('target_component - ' + target_component)
        console.log('command - ' + command)
        console.log('confirmation - ' + confirmation)
        console.log('param1 - ' + param1)
        console.log('param2 - ' + param2)
        console.log('param3 - ' + param3)
        console.log('param4 - ' + param4)
        console.log('param5 - ' + param5)
        console.log('param6 - ' + param6)
        console.log('param7 - ' + param7)
        console.log('============================================================')
    } else {
        if (mavPort !== null) {
            if (mavPort.isOpen) {
                mavPort.write(Buffer.from(message, 'hex'))
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
                clientId: 'TAS_MAV_' + nanoid(15),
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
                clientId: 'TAS_MAV_' + nanoid(15),
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

            if (sub_gcs_rf_topic !== '') {
                local_mqtt_client.subscribe(sub_gcs_rf_topic, function () {
                    console.log('[local_mqtt] sub_gcs_rf_topic is subscribed: ' + sub_gcs_rf_topic)
                })
            }
            if (sub_gcs_lte_topic !== '') {
                local_mqtt_client.subscribe(sub_gcs_lte_topic, function () {
                    console.log('[local_mqtt] sub_gcs_lte_topic is subscribed: ' + sub_gcs_lte_topic)
                })
            }
        })

        local_mqtt_client.on('message', function (topic, message) {
            if (topic === sub_gcs_rf_topic) {
                let gcsData = message.toString('hex')
                if (gcsData.substring(0, 2) === 'fe') {
                    let sequence = parseInt(gcsData.substring(4, 6), 16)
                    GCSData[sequence] = gcsData
                } else {
                    let sequence = parseInt(gcsData.substring(8, 10), 16)
                    GCSData[sequence] = gcsData
                }
                // console.log('[RF]', gcsData)
                gcs_noti_handler(gcsData)
            } else if (topic === sub_gcs_lte_topic) {
                let gcsData = message.toString('hex')
                if (gcsData.substring(0, 2) === 'fe') {
                    let sequence = parseInt(gcsData.substring(4, 6), 16)
                    if (GCSData.hasOwnProperty(sequence)) {
                        delete GCSData[sequence]
                        return
                    }
                } else {
                    let sequence = parseInt(gcsData.substring(4, 6), 16)
                    if (GCSData.hasOwnProperty(sequence)) {
                        delete GCSData[sequence]
                        return
                    }
                }
                // console.log('[LTE]', gcsData)
                gcs_noti_handler(gcsData)
            }
        })

        local_mqtt_client.on('error', function (err) {
            console.log('[local_mqtt] (error) ' + err.message)
        })
    }
}

function mavPortOpening() {
    if (mavPort === null) {
        mavPort = new SerialPort({
            path: mavPortNum,
            baudRate: parseInt(mavBaudrate, 10),
        })
        mavPort.on('open', mavPortOpen)
        mavPort.on('close', mavPortClose)
        mavPort.on('error', mavPortError)
        mavPort.on('data', mavPortData)
    } else {
        if (mavPort.isOpen) {
        } else {
            mavPort.open()
        }
    }
}

function mavPortOpen() {
    console.log('mavPort(' + mavPort.path + '), mavPort rate: ' + mavPort.baudRate + ' open.')
}

function mavPortClose() {
    console.log('mavPort closed.')

    setTimeout(mavPortOpening, 2000)
}

function mavPortError(error) {
    console.log('[mavPort error]: ' + error.message)

    setTimeout(mavPortOpening, 2000)
}

var mavStrFromDrone = ''
var mavStrFromDroneLength = 0
var mavVersion = 'unknown'
var mavVersionCheckFlag = false

function mavPortData(data) {
    mavStrFromDrone += data.toString('hex').toLowerCase()

    while (mavStrFromDrone.length > 20) {
        if (!mavVersionCheckFlag) {
            var stx = mavStrFromDrone.substring(0, 2)
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

                    mavStrFromDrone = mavStrFromDrone.substring(mavLength)
                    mavStrFromDroneLength = 0
                } else {
                    break
                }
            } else {
                mavStrFromDrone = mavStrFromDrone.substring(2)
            }
        } else {
            stx = mavStrFromDrone.substring(0, 2)
            if (mavVersion === 'v1' && stx === 'fe') {
                len = parseInt(mavStrFromDrone.substring(2, 4), 16)
                mavLength = (6 * 2) + (len * 2) + (2 * 2)

                if ((mavStrFromDrone.length) >= mavLength) {
                    mavPacket = mavStrFromDrone.substring(0, mavLength)
                    console.log('v1', mavPacket)

                    if (local_mqtt_client !== null) {
                        local_mqtt_client.publish(pub_drone_topic, mavPacket)
                    }
                    // if (mqtt_client !== null) {
                    //     mqtt_client.publish(my_cnt_name, Buffer.from(mavPacket, 'hex'))
                    // }
                    // if (rfPort !== null) {
                    //     if (rfPort.isOpen) {
                    //         rfPort.write(Buffer.from(mavPacket, 'hex'))
                    //     }
                    // }
                    // send_aggr_to_Mobius(my_cnt_name, mavPacket, 2000)
                    setTimeout(parseMavFromDrone, 0, mavPacket)

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
                    console.log('v2', mavPacket)

                    if (local_mqtt_client !== null) {
                        local_mqtt_client.publish(pub_drone_topic, mavPacket)
                    }
                    // if (mqtt_client !== null) {
                    //     mqtt_client.publish(my_cnt_name, Buffer.from(mavPacket, 'hex'))
                    // }
                    // if (rfPort !== null) {
                    //     if (rfPort.isOpen) {
                    //         rfPort.write(Buffer.from(mavPacket, 'hex'))
                    //     }
                    // }
                    // send_aggr_to_Mobius(my_cnt_name, mavPacket, 2000)
                    setTimeout(parseMavFromDrone, 0, mavPacket)

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

var fc = {}
var flag_base_mode = 0

function parseMavFromDrone(mavPacket) {
    try {
        var ver = mavPacket.substring(0, 2)
        if (ver === 'fd') {
            var cur_seq = parseInt(mavPacket.substring(8, 10), 16)
            var sys_id = parseInt(mavPacket.substring(10, 12).toLowerCase(), 16)
            var msg_id = parseInt(mavPacket.substring(18, 20) + mavPacket.substring(16, 18) + mavPacket.substring(14, 16), 16)
            var base_offset = 20
        } else {
            cur_seq = parseInt(mavPacket.substring(4, 6), 16)
            sys_id = parseInt(mavPacket.substring(6, 8).toLowerCase(), 16)
            msg_id = parseInt(mavPacket.substring(10, 12).toLowerCase(), 16)
            base_offset = 12
        }

        if (msg_id === mavlink.MAVLINK_MSG_ID_GLOBAL_POSITION_INT) { // #33
            var time_boot_ms = mavPacket.substring(base_offset, base_offset + 8).toLowerCase()
            base_offset += 8
            var lat = mavPacket.substring(base_offset, base_offset + 8).toLowerCase()
            base_offset += 8
            var lon = mavPacket.substring(base_offset, base_offset + 8).toLowerCase()
            base_offset += 8
            var alt = mavPacket.substring(base_offset, base_offset + 8).toLowerCase()
            base_offset += 8
            var relative_alt = mavPacket.substring(base_offset, base_offset + 8).toLowerCase()

            fc.global_position_int = {}
            fc.global_position_int.time_boot_ms = Buffer.from(time_boot_ms, 'hex').readUInt32LE(0)
            fc.global_position_int.lat = Buffer.from(lat, 'hex').readInt32LE(0)
            fc.global_position_int.lon = Buffer.from(lon, 'hex').readInt32LE(0)
            fc.global_position_int.alt = Buffer.from(alt, 'hex').readInt32LE(0)
            fc.global_position_int.relative_alt = Buffer.from(relative_alt, 'hex').readInt32LE(0)

            local_mqtt_client.publish(pub_parse_global_position_int, JSON.stringify(fc.global_position_int))
        } else if (msg_id === mavlink.MAVLINK_MSG_ID_HEARTBEAT) { // #00 : HEARTBEAT
            var custom_mode = mavPacket.substring(base_offset, base_offset + 8).toLowerCase()
            base_offset += 8
            var type = mavPacket.substring(base_offset, base_offset + 2).toLowerCase()
            base_offset += 2
            var autopilot = mavPacket.substring(base_offset, base_offset + 2).toLowerCase()
            base_offset += 2
            var base_mode = mavPacket.substring(base_offset, base_offset + 2).toLowerCase()
            base_offset += 2
            var system_status = mavPacket.substring(base_offset, base_offset + 2).toLowerCase()
            base_offset += 2
            var mavlink_version = mavPacket.substring(base_offset, base_offset + 2).toLowerCase()

            fc.heartbeat = {}
            fc.heartbeat.type = Buffer.from(type, 'hex').readUInt8(0)
            fc.heartbeat.autopilot = Buffer.from(autopilot, 'hex').readUInt8(0)
            fc.heartbeat.base_mode = Buffer.from(base_mode, 'hex').readUInt8(0)
            fc.heartbeat.custom_mode = Buffer.from(custom_mode, 'hex').readUInt32LE(0)
            fc.heartbeat.system_status = Buffer.from(system_status, 'hex').readUInt8(0)
            fc.heartbeat.mavlink_version = Buffer.from(mavlink_version, 'hex').readUInt8(0)

            local_mqtt_client.publish(pub_parse_heartbeat, JSON.stringify(fc.heartbeat))

            if (fc.heartbeat.base_mode & 0x80) {
                if (flag_base_mode === 3) {
                    flag_base_mode++
                    my_sortie_name = moment().format('YYYY_MM_DD_T_HH_mm')
                    local_mqtt_client.publish(pub_sortie_topic, my_sortie_name)
                } else {
                    flag_base_mode++
                    if (flag_base_mode > 16) {
                        flag_base_mode = 16
                    }
                }
            } else {
                flag_base_mode = 0

                my_sortie_name = 'disarm'
                local_mqtt_client.publish(pub_sortie_topic, my_sortie_name)
            }
        } else if (msg_id === mavlink.MAVLINK_MSG_ID_PARAM_VALUE) {
            let param_value = mavPacket.substring(base_offset, base_offset + 8).toLowerCase()
            base_offset += 8
            let param_count = mavPacket.substring(base_offset, base_offset + 4).toLowerCase()
            base_offset += 4
            let param_index = mavPacket.substring(base_offset, base_offset + 4).toLowerCase()
            base_offset += 4
            let param_id = mavPacket.substring(base_offset, base_offset + 32).toLowerCase()
            base_offset += 32
            let param_type = mavPacket.substring(base_offset, base_offset + 2).toLowerCase()

            fc.wp_yaw_behavior = {}
            fc.wp_yaw_behavior.id = Buffer.from(param_id, "hex").toString('ASCII').toLowerCase()
            fc.wp_yaw_behavior.id = fc.wp_yaw_behavior.id.replace(/\0/g, '')

            if (fc.wp_yaw_behavior.id === 'wp_yaw_behavior') {
                fc.wp_yaw_behavior.value = Buffer.from(param_value, 'hex').readFloatLE(0)
                fc.wp_yaw_behavior.type = Buffer.from(param_type, 'hex').readInt8(0)
                fc.wp_yaw_behavior.count = Buffer.from(param_count, 'hex').readInt16LE(0)
                fc.wp_yaw_behavior.index = Buffer.from(param_index, 'hex').readUInt16LE(0)

                local_mqtt_client.publish(pub_parse_wp_yaw_behavior, JSON.stringify(fc.wp_yaw_behavior))
            }
        } else if (msg_id === mavlink.MAVLINK_MSG_ID_SYSTEM_TIME) { // #02 : SYSTEM_TIME
            // muv_mqtt_client.publish(muv_pub_fc_system_time_topic, mavPacket)
        } else if (msg_id === mavlink.MAVLINK_MSG_ID_TIMESYNC) { // #111 : TIMESYNC
            // muv_mqtt_client.publish(muv_pub_fc_timesync_topic, mavPacket)
        } else if (msg_id === mavlink.MAVLINK_MSG_ID_DISTANCE_SENSOR) {
            // console.log('---> ' + 'MAVLINK_MSG_ID_DISTANCE_SENSOR - ' + mavPacket);
            var time_boot_ms = mavPacket.substring(base_offset, base_offset + 8).toLowerCase();
            base_offset += 8;
            var min_distance = mavPacket.substring(base_offset, base_offset + 4).toLowerCase();
            base_offset += 4;
            var max_distance = mavPacket.substring(base_offset, base_offset + 4).toLowerCase();
            base_offset += 4;
            var current_distance = mavPacket.substring(base_offset, base_offset + 4).toLowerCase();
            base_offset += 4;
            var type = mavPacket.substring(base_offset, base_offset + 2).toLowerCase();
            base_offset += 2;
            var id = mavPacket.substring(base_offset, base_offset + 2).toLowerCase();
            base_offset += 2;
            var orientation = mavPacket.substring(base_offset, base_offset + 2).toLowerCase();
            base_offset += 2;
            var covariance = mavPacket.substring(base_offset, base_offset + 2).toLowerCase();

            fc.distance_sensor = {}
            fc.distance_sensor.min_distance = Buffer.from(min_distance, 'hex').readInt16LE(0);
            fc.distance_sensor.max_distance = Buffer.from(max_distance, 'hex').readInt16LE(0);
            fc.distance_sensor.current_distance = Buffer.from(current_distance, 'hex').readInt16LE(0);
            fc.distance_sensor.type = Buffer.from(type, 'hex').readUInt8(0);
            fc.distance_sensor.id = Buffer.from(id, 'hex').readUInt8(0);
            fc.distance_sensor.orientation = Buffer.from(orientation, 'hex').readUInt8(0);
            fc.distance_sensor.covariance = Buffer.from(covariance, 'hex').readUInt8(0);
            // console.log(fc.distance_sensor)
            local_mqtt_client.publish(pub_parse_distance_sensor, JSON.stringify(fc.distance_sensor))
        }
    } catch (e) {
        console.log('[parseMavFromDrone Error]', e)
    }
}

// function createMissionContainer(idx) {
//     var mission_parent_path = mission_parent[idx]
//     sh_adn.crtct(mission_parent_path + '?rcn=0', my_sortie_name, 0, function (rsc, res_body, count) {
//     })
// }
