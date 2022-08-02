/**
 * Created by Wonseok Jung in KETI on 2020-08-02.
 */
const {SerialPort} = require('serialport')
const mqtt = require("mqtt")
const {nanoid} = require("nanoid")
const fs = require("fs");

let rfPort = null
var rfPortNum = '/dev/ttyAMA1'
var rfBaudrate = '115200'

let local_mqtt_client = null

let pub_gcs_topic = '/TELE/gcs/rf'
let sub_drone_topic = '/TELE/drone'
let sub_sortie_topic = '/TELE/sorite'

rfPortOpening()

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

function rfPortData(data) {
    // TODO: RF 데이터(GCS) 받아서 로컬로 패스
    console.log(data)
    local_mqtt_client.publish(pub_gcs_topic, data)
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
                if (mqtt_client !== null) {
                    if (my_cnt_name !== '') {
                        // console.log(message.toString())
                        mqtt_client.publish(my_cnt_name, Buffer.from(message.toString(), 'hex'))
                        send_aggr_to_Mobius(my_cnt_name, message.toString(), 2000)
                    }
                }
            }
        })

        local_mqtt_client.on('error', function (err) {
            console.log('[local_mqtt] (error) ' + err.message)
        })
    }
}