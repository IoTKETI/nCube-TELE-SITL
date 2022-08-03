/**
 * Created by Wonseok Jung in KETI on 2020-08-02.
 */
const {SerialPort} = require('serialport')
const mqtt = require("mqtt")
const {nanoid} = require("nanoid")
const fs = require("fs")

let conf = JSON.parse(process.env.conf)



let rfPort = null
// var rfPortNum = '/dev/ttyAMA1'
var rfPortNum = 'COM1'
var rfBaudrate = '115200'

let local_mqtt_client = null

let pub_gcs_topic = '/TELE/gcs/rf'
let sub_drone_topic = '/TELE/drone'
let sub_sortie_topic = '/TELE/sorite'

let my_sortie_name = 'disarm'

init()

function init() {
    let drone_info = {}
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
        drone_info.mission["msw_lgu_lte"] = {}
        drone_info.mission["msw_lgu_lte"].container = ['LTE']
        drone_info.mission["msw_lgu_lte"].sub_container = []
        drone_info.mission["msw_lgu_lte"].git = "https://github.com/IoTKETI/msw_lgu_lte.git"
        drone_info.id = conf.ae.name
        fs.writeFileSync('drone_info.json', JSON.stringify(drone_info, null, 4), 'utf8')
    }
    // TODO: MSW 실행하도록... git clone이나 git pull은 제외, npm install도 제외 단순히 실행만하도록
    // setTimeout(fork_msw, 10, mission_name, directory_name)

    rfPortOpening()
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

function rfPortData(data) {  // GCS 데이터 로컬 MQTT로 전달
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
