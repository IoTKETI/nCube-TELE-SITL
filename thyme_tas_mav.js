/**
 * Created by Il Yeup, Ahn in KETI on 2017-02-25.
 */

/**
 * Copyright (c) 2018, OCEAN
 * All rights reserved.
 * Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:
 * 1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
 * 3. The name of the author may not be used to endorse or promote products derived from this software without specific prior written permission.
 * THIS SOFTWARE IS PROVIDED BY THE AUTHOR ``AS IS'' AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

// for TAS
var moment = require('moment');
var fs = require('fs');
const {exec} = require('child_process');

var mavlink = require('./mavlibrary/mavlink.js');

global.mavPort = null;
var mavPortNum = '/dev/ttyAMA0';
var mavBaudrate = '115200';

global.rfPort = null;
var rfPortNum = '/dev/ttyAMA1';
var rfBaudrate = '115200';

exports.ready = function tas_ready() {
    if ((my_drone_type === 'pixhawk') || (my_drone_type === 'ardupilot') || (my_drone_type === 'px4')) {
        exec("cat /etc/*release* | grep -w ID | cut -d '=' -f 2", (error, stdout, stderr) => {
            if (error) {  // Windows
                console.log('OS is Windows');
                mavPortNum = 'COM21';
                mavBaudrate = '115200';
            }
            if (stdout === "raspbian\n") {  // CROW
                console.log('OS is Raspberry Pi');
                mavPortNum = '/dev/ttyAMA0';
                mavBaudrate = '115200';
            } else if (stdout === "ubuntu\n") {  // KEA
                console.log('OS is Ubuntu');
                mavPortNum = '/dev/ttyTHS0';
                mavBaudrate = '115200';
            }
            mavPortOpening();
        });
    } else {
    }
};

var aggr_content = {};

function send_aggr_to_Mobius(topic, content_each, gap) {
    if (aggr_content.hasOwnProperty(topic)) {
        var timestamp = moment().format('YYYY-MM-DDTHH:mm:ssSSS');
        aggr_content[topic][timestamp] = content_each;
    } else {
        aggr_content[topic] = {};
        timestamp = moment().format('YYYY-MM-DDTHH:mm:ssSSS');
        aggr_content[topic][timestamp] = content_each;

        setTimeout(function () {
            sh_adn.crtci(topic + '?rcn=0', 0, aggr_content[topic], null, function () {
            });

            delete aggr_content[topic];
        }, gap, topic);
    }
}

exports.noti = function (path_arr, cinObj, socket) {
    var cin = {};
    cin.ctname = path_arr[path_arr.length - 2];
    cin.con = (cinObj.con != null) ? cinObj.con : cinObj.content;

    if (cin.con == '') {
        console.log('---- is not cin message');
    } else {
        socket.write(JSON.stringify(cin));
    }
};

exports.gcs_noti_handler = function (message) {
    // console.log(message.toString('hex'));
    sh_adn.crtci(my_command_name + '?rcn=0', 0, message.toString('hex'), null, function () {
    });
    if ((my_drone_type === 'pixhawk') || (my_drone_type === 'ardupilot') || (my_drone_type === 'px4')) {
        if (mavPort != null) {
            if (mavPort.isOpen) {
                mavPort.write(message);
            }
        }
    } else {

    }
};

var {SerialPort} = require('serialport');

function rfPortOpening() {
    if (rfPort == null && my_rf_port !== '') {
        rfPort = new SerialPort({
            path: rfPortNum,
            baudRate: parseInt(rfBaudrate, 10),
        });

        rfPort.on('open', rfPortOpen);
        rfPort.on('close', rfPortClose);
        rfPort.on('error', rfPortError);
        rfPort.on('data', rfPortData);
    } else {
        if (rfPort.isOpen) {

        } else {
            rfPort.open();
        }
    }
}

function rfPortOpen() {
    console.log('rfPort(' + rfPort.path + '), rfPort rate: ' + rfPort.baudRate + ' open.');
}

function rfPortClose() {
    console.log('rfPort closed.');

    setTimeout(rfPortOpening, 2000);
}

function rfPortError(error) {
    var error_str = error.toString();
    console.log('[rfPort error]: ' + error.message);
    if (error_str.substring(0, 14) == "Error: Opening") {

    } else {
        console.log('rfPort error : ' + error);
    }

    setTimeout(rfPortOpening, 2000);
}

function rfPortData(data) {
    if (mavPort != null) {
        if (mavPort.isOpen) {
            mavPort.write(data);
        }
    }
}

function mavPortOpening() {
    if (mavPort == null) {
        mavPort = new SerialPort({
            path: mavPortNum,
            baudRate: parseInt(mavBaudrate, 10),
        });

        mavPort.on('open', mavPortOpen);
        mavPort.on('close', mavPortClose);
        mavPort.on('error', mavPortError);
        mavPort.on('data', mavPortData);
    } else {
        if (mavPort.isOpen) {

        } else {
            mavPort.open();
        }
    }
}

function mavPortOpen() {
    console.log('mavPort(' + mavPort.path + '), mavPort rate: ' + mavPort.baudRate + ' open.');
}

function mavPortClose() {
    console.log('mavPort closed.');

    setTimeout(mavPortOpening, 2000);
}

function mavPortError(error) {
    var error_str = error.toString();
    console.log('[mavPort error]: ' + error.message);
    if (error_str.substring(0, 14) == "Error: Opening") {

    } else {
        console.log('mavPort error : ' + error);
    }

    setTimeout(mavPortOpening, 2000);
}

var mavStrFromDrone = '';
var mavStrFromDroneLength = 0;
var mavVersion = 'unknown';
var mavVersionCheckFlag = false;

function mavPortData(data) {
    mavStrFromDrone += data.toString('hex').toLowerCase();
    // console.log(mavStrFromDrone)

    while (mavStrFromDrone.length > 20) {
        if (!mavVersionCheckFlag) {
            var stx = mavStrFromDrone.substr(0, 2);
            if (stx === 'fe') {
                var len = parseInt(mavStrFromDrone.substr(2, 2), 16);
                var mavLength = (6 * 2) + (len * 2) + (2 * 2);
                var sysid = parseInt(mavStrFromDrone.substr(6, 2), 16);
                var msgid = parseInt(mavStrFromDrone.substr(10, 2), 16);

                if (msgid === 0 && len === 9) { // HEARTBEAT
                    mavVersionCheckFlag = true;
                    mavVersion = 'v1';
                }

                if ((mavStrFromDrone.length) >= mavLength) {
                    var mavPacket = mavStrFromDrone.substr(0, mavLength);

                    mavStrFromDrone = mavStrFromDrone.substr(mavLength);
                    mavStrFromDroneLength = 0;
                } else {
                    break;
                }
            } else if (stx === 'fd') {
                len = parseInt(mavStrFromDrone.substr(2, 2), 16);
                mavLength = (10 * 2) + (len * 2) + (2 * 2);

                sysid = parseInt(mavStrFromDrone.substr(10, 2), 16);
                msgid = parseInt(mavStrFromDrone.substr(18, 2) + mavStrFromDrone.substr(16, 2) + mavStrFromDrone.substr(14, 2), 16);

                if (msgid === 0 && len === 9) { // HEARTBEAT
                    mavVersionCheckFlag = true;
                    mavVersion = 'v2';
                }
                if (mavStrFromDrone.length >= mavLength) {
                    mavPacket = mavStrFromDrone.substr(0, mavLength);

                    mavStrFromDrone = mavStrFromDrone.substr(mavLength);
                    mavStrFromDroneLength = 0;
                } else {
                    break;
                }
            } else {
                mavStrFromDrone = mavStrFromDrone.substr(2);
            }
        } else {
            stx = mavStrFromDrone.substr(0, 2);
            if (mavVersion === 'v1' && stx === 'fe') {
                len = parseInt(mavStrFromDrone.substr(2, 2), 16);
                mavLength = (6 * 2) + (len * 2) + (2 * 2);

                if ((mavStrFromDrone.length) >= mavLength) {
                    mavPacket = mavStrFromDrone.substr(0, mavLength);

                    if (mqtt_client !== null) {
                        mqtt_client.publish(my_cnt_name, Buffer.from(mavPacket, 'hex'));
                    }
                    if (rfPort != null) {
                        if (rfPort.isOpen) {
                            rfPort.write(mavPacket);
                        }
                    }
                    send_aggr_to_Mobius(my_cnt_name, mavPacket, 2000);
                    setTimeout(parseMavFromDrone, 0, mavPacket);

                    mavStrFromDrone = mavStrFromDrone.substr(mavLength);
                    mavStrFromDroneLength = 0;
                } else {
                    break;
                }
            } else if (mavVersion === 'v2' && stx === 'fd') {
                len = parseInt(mavStrFromDrone.substr(2, 2), 16);
                mavLength = (10 * 2) + (len * 2) + (2 * 2);

                if (mavStrFromDrone.length >= mavLength) {
                    mavPacket = mavStrFromDrone.substr(0, mavLength);

                    if (mqtt_client !== null) {
                        mqtt_client.publish(my_cnt_name, Buffer.from(mavPacket, 'hex'));
                    }
                    if (rfPort != null) {
                        if (rfPort.isOpen) {
                            rfPort.write(mavPacket);
                        }
                    }
                    send_aggr_to_Mobius(my_cnt_name, mavPacket, 2000);
                    setTimeout(parseMavFromDrone, 0, mavPacket);

                    mavStrFromDrone = mavStrFromDrone.substr(mavLength);
                    mavStrFromDroneLength = 0;
                } else {
                    break;
                }
            } else {
                mavStrFromDrone = mavStrFromDrone.substr(2);
            }
        }
    }
}

var fc = {};
try {
    fc = JSON.parse(fs.readFileSync('fc_data_model.json', 'utf8'));
} catch (e) {
    fc.heartbeat = {};
    fc.heartbeat.type = 2;
    fc.heartbeat.autopilot = 3;
    fc.heartbeat.base_mode = 0;
    fc.heartbeat.custom_mode = 0;
    fc.heartbeat.system_status = 0;
    fc.heartbeat.mavlink_version = 1;

    fc.global_position_int = {};
    fc.global_position_int.time_boot_ms = 123456789;
    fc.global_position_int.lat = 0;
    fc.global_position_int.lon = 0;
    fc.global_position_int.alt = 0;
    fc.global_position_int.vx = 0;
    fc.global_position_int.vy = 0;
    fc.global_position_int.vz = 0;
    fc.global_position_int.hdg = 65535;

    fc.wp_yaw_behavior = {};
    fc.wp_yaw_behavior.value = 0;
    fc.wp_yaw_behavior.count = 0;
    fc.wp_yaw_behavior.index = 0;
    fc.wp_yaw_behavior.id = 0;
    fc.wp_yaw_behavior.type = 0;

    fs.writeFileSync('fc_data_model.json', JSON.stringify(fc, null, 4), 'utf8');
}

var flag_base_mode = 0;

function parseMavFromDrone(mavPacket) {
    try {
        var ver = mavPacket.substr(0, 2);
        if (ver == 'fd') {
            var sysid = mavPacket.substr(10, 2).toLowerCase();
            var msgid = mavPacket.substr(18, 2) + mavPacket.substr(16, 2) + mavPacket.substr(14, 2);
            var base_offset = 20;
        } else {
            sysid = mavPacket.substr(6, 2).toLowerCase();
            msgid = mavPacket.substr(10, 2).toLowerCase();
            base_offset = 12;
        }

        var sys_id = parseInt(sysid, 16);
        var msg_id = parseInt(msgid, 16);

        var cur_seq = parseInt(mavPacket.substr(4, 2), 16);

        if (msg_id == mavlink.MAVLINK_MSG_ID_GLOBAL_POSITION_INT) { // #33
            var time_boot_ms = mavPacket.substr(base_offset, 8).toLowerCase();
            base_offset += 8;
            var lat = mavPacket.substr(base_offset, 8).toLowerCase();
            base_offset += 8;
            var lon = mavPacket.substr(base_offset, 8).toLowerCase();
            base_offset += 8;
            var alt = mavPacket.substr(base_offset, 8).toLowerCase();
            base_offset += 8;
            var relative_alt = mavPacket.substr(base_offset, 8).toLowerCase();

            fc.global_position_int.time_boot_ms = Buffer.from(time_boot_ms, 'hex').readUInt32LE(0);
            fc.global_position_int.lat = Buffer.from(lat, 'hex').readInt32LE(0);
            fc.global_position_int.lon = Buffer.from(lon, 'hex').readInt32LE(0);
            fc.global_position_int.alt = Buffer.from(alt, 'hex').readInt32LE(0);
            fc.global_position_int.relative_alt = Buffer.from(relative_alt, 'hex').readInt32LE(0);

            muv_mqtt_client.publish(muv_pub_fc_gpi_topic, JSON.stringify(fc.global_position_int));
        } else if (msg_id == mavlink.MAVLINK_MSG_ID_HEARTBEAT) { // #00 : HEARTBEAT
            var custom_mode = mavPacket.substr(base_offset, 8).toLowerCase();
            base_offset += 8;
            var type = mavPacket.substr(base_offset, 2).toLowerCase();
            base_offset += 2;
            var autopilot = mavPacket.substr(base_offset, 2).toLowerCase();
            base_offset += 2;
            var base_mode = mavPacket.substr(base_offset, 2).toLowerCase();
            base_offset += 2;
            var system_status = mavPacket.substr(base_offset, 2).toLowerCase();
            base_offset += 2;
            var mavlink_version = mavPacket.substr(base_offset, 2).toLowerCase();

            fc.heartbeat.type = Buffer.from(type, 'hex').readUInt8(0);
            fc.heartbeat.autopilot = Buffer.from(autopilot, 'hex').readUInt8(0);
            fc.heartbeat.base_mode = Buffer.from(base_mode, 'hex').readUInt8(0);
            fc.heartbeat.custom_mode = Buffer.from(custom_mode, 'hex').readUInt32LE(0);
            fc.heartbeat.system_status = Buffer.from(system_status, 'hex').readUInt8(0);
            fc.heartbeat.mavlink_version = Buffer.from(mavlink_version, 'hex').readUInt8(0);

            muv_mqtt_client.publish(muv_pub_fc_hb_topic, JSON.stringify(fc.heartbeat));

            // TODO: disarmed에도 sortie 생성하는 문제 수정
            // if ((fc.heartbeat.base_mode & 0x80) === 0x80) {
            //         start_arm_time = moment();
            //         my_sortie_name = moment().format('YYYY_MM_DD_T_HH_mm');
            //         my_cnt_name = my_parent_cnt_name + '/' + my_sortie_name;
            //         sh_adn.crtct(my_parent_cnt_name + '?rcn=0', my_sortie_name, 0, function (rsc, res_body, count) {
            //         });
            //         cal_flag = 1;
            //         cal_sortiename = my_sortie_name;
            // } else {
            //     if (cal_flag == 1) {
            //         cal_flag = 0;
            //         calculateFlightTime(cal_sortiename);
            //     }
            //     my_sortie_name = 'disarm';
            //     my_cnt_name = my_parent_cnt_name + '/' + my_sortie_name;
            //     my_gimbal_name = my_gimbal_parent + '/' + my_sortie_name;
            // }
            if (fc.heartbeat.base_mode & 0x80) {
                if (flag_base_mode == 3) {
                    start_arm_time = moment();
                    flag_base_mode++;
                    my_sortie_name = moment().format('YYYY_MM_DD_T_HH_mm');
                    my_cnt_name = my_parent_cnt_name + '/' + my_sortie_name;
                    sh_adn.crtct(my_parent_cnt_name + '?rcn=0', my_sortie_name, 0, function (rsc, res_body, count) {
                    });

                    // for (var idx in mission_parent) {
                    //     if (mission_parent.hasOwnProperty(idx)) {
                    //         setTimeout(createMissionContainer, 10, idx);
                    //     }
                    // }
                } else {
                    flag_base_mode++;
                    if (flag_base_mode > 16) {
                        flag_base_mode = 16;
                    }
                }
            } else {
                flag_base_mode = 0;

                my_sortie_name = 'disarm';
                my_cnt_name = my_parent_cnt_name + '/' + my_sortie_name;
                my_gimbal_name = my_gimbal_parent + '/' + my_sortie_name;
            }
        } else if (msg_id == mavlink.MAVLINK_MSG_ID_SYSTEM_TIME) { // #02 : SYSTEM_TIME
            muv_mqtt_client.publish(muv_pub_fc_system_time_topic, mavPacket);
        } else if (msg_id == mavlink.MAVLINK_MSG_ID_TIMESYNC) { // #111 : TIMESYNC
            muv_mqtt_client.publish(muv_pub_fc_timesync_topic, mavPacket);
        } else if (msg_id == mavlink.MAVLINK_MSG_ID_PARAM_VALUE) {
            let param_value = mavPacket.substr(base_offset, 8).toLowerCase();
            base_offset += 8;
            let param_count = mavPacket.substr(base_offset, 4).toLowerCase();
            base_offset += 4;
            let param_index = mavPacket.substr(base_offset, 4).toLowerCase();
            base_offset += 4;
            let param_id = mavPacket.substr(base_offset, 32).toLowerCase();
            base_offset += 32;
            let param_type = mavPacket.substr(base_offset, 2).toLowerCase();

            fc.wp_yaw_behavior.id = Buffer.from(param_id, "hex").toString('ASCII').toLowerCase();
            fc.wp_yaw_behavior.id = fc.wp_yaw_behavior.id.replace(/\0/g, '');

            if (fc.wp_yaw_behavior.id === 'wp_yaw_behavior') {
                fc.wp_yaw_behavior.value = Buffer.from(param_value, 'hex').readFloatLE(0);
                fc.wp_yaw_behavior.type = Buffer.from(param_type, 'hex').readInt8(0);
                fc.wp_yaw_behavior.count = Buffer.from(param_count, 'hex').readInt16LE(0);
                fc.wp_yaw_behavior.index = Buffer.from(param_index, 'hex').readUInt16LE(0);

                muv_mqtt_client.publish(muv_pub_fc_wp_yaw_behavior_topic, JSON.stringify(fc.wp_yaw_behavior));
            }
        }
    } catch (e) {
        console.log('[parseMavFromDrone Error]', e);
    }
}

// function createMissionContainer(idx) {
//     var mission_parent_path = mission_parent[idx];
//     sh_adn.crtct(mission_parent_path + '?rcn=0', my_sortie_name, 0, function (rsc, res_body, count) {
//     });
// }

