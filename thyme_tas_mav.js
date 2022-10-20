/**
 * Created by Wonseok Jung in KETI on 2020-08-02.
 */

const moment = require('moment')
const fs = require('fs')
const {exec} = require('child_process')
const dgram = require("dgram");
const mqtt = require("mqtt")
const {nanoid} = require("nanoid")

const mavlink = require('./mavlibrary/mavlink.js')

let conf = JSON.parse(process.env.conf)

let local_mqtt_client = null
let sub_gcs_rf_topic = '/TELE/gcs/rf'
let sub_gcs_lte_topic = '/TELE/gcs/lte'
let pub_drone_topic = '/TELE/drone'
let pub_sortie_topic = '/TELE/sorite'
let pub_parse_global_position_int = '/TELE/drone/gpi'
let pub_parse_heartbeat = '/TELE/drone/hb'
let pub_parse_wp_yaw_behavior = '/TELE/drone/wp_yaw_behavior'
let pub_parse_distance_sensor = '/TELE/drone/distance_sensor'
let pub_parse_timesync = '/TELE/drone/timesync'
let pub_parse_system_time = '/TELE/drone/system_time'

let my_sortie_name = 'disarm'

let GCSData = {}

let HOST = '127.0.0.1';
let PORT1 = 14555; // output: SITL --> GCS
let PORT2 = 14556; // input : GCS --> SITL

global.sitlUDP = null;
global.sitlUDP2 = null;

sitlUDP2 = dgram.createSocket('udp4');

tas_ready()

function tas_ready() {
    local_mqtt_connect('localhost')
    mavPortOpening()
}

let control = {};

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

    if (msg_id === mavlink.MAVLINK_MSG_ID_COMMAND_LONG) {
        console.log('[send_reserved_control_command]', message)

        var param1 = message.substring(base_offset, base_offset + 8).toLowerCase();
        base_offset += 8;
        var param2 = message.substring(base_offset, base_offset + 8).toLowerCase();
        base_offset += 8;
        var param3 = message.substring(base_offset, base_offset + 8).toLowerCase();
        base_offset += 8;
        var param4 = message.substring(base_offset, base_offset + 8).toLowerCase();
        base_offset += 8;
        var param5 = message.substring(base_offset, base_offset + 8).toLowerCase();
        base_offset += 8;
        var param6 = message.substring(base_offset, base_offset + 8).toLowerCase();
        base_offset += 8;
        var param7 = message.substring(base_offset, base_offset + 8).toLowerCase();
        base_offset += 8;
        var command = message.substring(base_offset, base_offset + 4).toLowerCase();
        base_offset += 4;
        var target_system = message.substring(base_offset, base_offset + 2).toLowerCase();
        base_offset += 2;
        var target_component = message.substring(base_offset, base_offset + 2).toLowerCase();
        base_offset += 2;
        var confirmation = message.substring(base_offset, base_offset + 2).toLowerCase();

        control.param1 = Buffer.from(param1, 'hex').readFloatLE(0);
        control.param2 = Buffer.from(param2, 'hex').readFloatLE(0);
        control.param3 = Buffer.from(param3, 'hex').readFloatLE(0);
        control.param4 = Buffer.from(param4, 'hex').readFloatLE(0);
        control.param5 = Buffer.from(param5, 'hex').readFloatLE(0);
        control.param6 = Buffer.from(param6, 'hex').readFloatLE(0);
        control.param7 = Buffer.from(param7, 'hex').readFloatLE(0);
        control.command = Buffer.from(command, 'hex').readUInt16LE(0);
        control.target_system = Buffer.from(target_system, 'hex').readUInt8(0);
        control.target_component = Buffer.from(target_component, 'hex').readUInt8(0);
        control.confirmation = Buffer.from(confirmation, 'hex').readUInt8(0);

        if (control.command === 248) {
            let control_channels = {}
            control_channels.channel = control.param1
            control_channels.value = control.param2

            local_mqtt_client.publish('/Control', JSON.stringify(control_channels))
            console.log('============================================================')
            console.log('target_system - ' + control.target_system)
            console.log('target_component - ' + control.target_component)
            console.log('command - ' + control.command)
            console.log('confirmation - ' + control.confirmation)
            console.log('param1 - ' + control.param1)
            console.log('param2 - ' + control.param2)
            console.log('param3 - ' + control.param3)
            console.log('param4 - ' + control.param4)
            console.log('param5 - ' + control.param5)
            console.log('param6 - ' + control.param6)
            console.log('param7 - ' + control.param7)
            console.log('============================================================')
        } else {
            if (sitlUDP2 != null) {
                sitlUDP2.send(message, 0, message.length, PORT2, HOST,
                    function (err) {
                        if (err) {
                            console.log('UDP message send error', err);
                            return;
                        }
                    }
                );
            } else {
                console.log('send cmd via sitlUDP2')
            }
        }
    } else {
        if (sitlUDP2 != null) {
            sitlUDP2.send(message, 0, message.length, PORT2, HOST,
                function (err) {
                    if (err) {
                        console.log('UDP message send error', err);
                        return;
                    }
                }
            );
        } else {
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
                clientId: 'TELE_MAV_' + nanoid(15),
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
                clientId: 'TELE_MAV_' + nanoid(15),
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
    if (sitlUDP === null) {
        sitlUDP = dgram.createSocket('udp4');
        sitlUDP.bind(PORT1, HOST);

        sitlUDP.on('listening', mavPortOpen);
        sitlUDP.on('message', mavPortData);
        sitlUDP.on('close', mavPortClose);
        sitlUDP.on('error', mavPortError);
    }
}

function mavPortOpen() {
    console.log('UDP socket connect to ' + sitlUDP.address().address + ':' + sitlUDP.address().port);
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
                    // console.log('v1', mavPacket)

                    if (local_mqtt_client !== null) {
                        local_mqtt_client.publish(pub_drone_topic, mavPacket)
                    }
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
                    // console.log('v2', mavPacket)

                    if (local_mqtt_client !== null) {
                        local_mqtt_client.publish(pub_drone_topic, mavPacket)
                    }
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
            // local_mqtt_client.publish(pub_parse_timesync, mavPacket)
        } else if (msg_id === mavlink.MAVLINK_MSG_ID_TIMESYNC) { // #111 : TIMESYNC
            // local_mqtt_client.publish(pub_parse_system_time, mavPacket)
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

            local_mqtt_client.publish(pub_parse_distance_sensor, JSON.stringify(fc.distance_sensor))
        }
    } catch (e) {
        console.log('[parseMavFromDrone Error]', e)
    }
}