/**
 * Created by Wonseok Jung in KETI on 2020-08-02.
 */

const fs = require('fs');

let conf = {};
let cse = {};
let ae = {};
let cnt_arr = [];
let sub_arr = [];
let acp = {};

conf.useprotocol = 'http'; // select one for 'http' or 'mqtt' or 'coap' or 'ws'

// build cse
let approval_host = {}
approval_host.ip = 'gcs.iotocean.org';

cse.host        = approval_host.ip;
cse.port        = '7579';
cse.name        = 'Mobius';
cse.id          = '/Mobius2';
cse.mqttport    = '1883';
cse.wsport      = '7577';

// build ae
let ae_name = {};
try {
    ae_name = JSON.parse(fs.readFileSync('flight.json', 'utf8'));
} catch (e) {
    console.log('can not find flight.json file');
    ae_name.approval_gcs = 'MUV';
    ae_name.flight = 'Dione';
    fs.writeFileSync('flight.json', JSON.stringify(ae_name, null, 4), 'utf8');
}

ae.approval_gcs = ae_name.approval_gcs;
ae.name = ae_name.flight;

ae.id = 'S' + ae.name;

ae.parent       = '/' + cse.name;
ae.appid        = require('shortid').generate();
ae.port         = '9727';
ae.bodytype     = 'json'; // select 'json' or 'xml' or 'cbor'
ae.tas_mav_port = '3105';
ae.tas_sec_port = '3105';


// build cnt
// var count = 0;
// cnt_arr[count] = {};
// cnt_arr[count].parent = '/' + cse.name + '/' + ae.name;
// cnt_arr[count++].name = '0.2.481.1.114.IND-0004.24';
// cnt_arr[count] = {};
// cnt_arr[count].parent = '/' + cse.name + '/' + ae.name;
// cnt_arr[count++].name = 'tvoc';
//cnt_arr[count] = {};
//cnt_arr[count].parent = '/' + cse.name + '/' + ae.name;
//cnt_arr[count++].name = 'timer';

// build sub
// count = 0;
//sub_arr[count] = {};
//sub_arr[count].parent = '/' + cse.name + '/' + ae.name + '/' + cnt_arr[1].name;
//sub_arr[count].name = 'sub-ctrl';
//sub_arr[count++].nu = 'mqtt://' + cse.host + '/' + ae.id;

// --------
// sub_arr[count] = {};
// sub_arr[count].parent = '/' + cse.name + '/' + ae.name + '/' + cnt_arr[1].name;
// sub_arr[count].name = 'sub';
// sub_arr[count++].nu = 'mqtt://' + cse.host + '/' + ae.id + '?ct=' + ae.bodytype; // mqtt
//sub_arr[count++].nu = 'http://' + ip.address() + ':' + ae.port + '/noti?ct=json'; // http
//sub_arr[count++].nu = 'Mobius/'+ae.name; // mqtt
// --------

// sub_arr[count] = {};
// sub_arr[count].parent = '/' + cse.name + '/' + ae.name + '/' + cnt_arr[1].name;
// sub_arr[count].name = 'sub1';
// sub_arr[count++].nu = 'mqtt://' + cse.host + '/' + ae.id + '1?ct=xml'; // mqtt
// sub_arr[count] = {};
// sub_arr[count].parent = '/' + cse.name + '/' + ae.name + '/' + cnt_arr[1].name;
// sub_arr[count].name = 'sub2';
// sub_arr[count++].nu = 'mqtt://' + cse.host + '/' + ae.id + '2?ct=xml'; // mqtt
// sub_arr[count] = {};
// sub_arr[count].parent = '/' + cse.name + '/' + ae.name + '/' + cnt_arr[1].name;
// sub_arr[count].name = 'sub3';
// sub_arr[count++].nu = 'mqtt://' + cse.host + '/' + ae.id + '3?ct=xml'; // mqtt


/*// --------
sub_arr[count] = {};
sub_arr[count].parent = '/' + cse.name + '/' + ae.name + '/' + cnt_arr[1].name;
sub_arr[count].name = 'sub2';
//sub_arr[count++].nu = 'http://' + ip.address() + ':' + ae.port + '/noti?ct=json'; // http
//sub_arr[count++].nu = 'mqtt://' + cse.host + '/' + ae.id + '?rcn=9&ct=' + ae.bodytype; // mqtt
sub_arr[count++].nu = 'mqtt://' + cse.host + '/' + ae.id + '?ct=json'; // mqtt
// -------- */

// build acp: not complete
acp.parent = '/' + cse.name + '/' + ae.name;
acp.name = 'acp-' + ae.name;
acp.id = ae.id;


conf.usesecure = 'disable';

if (conf.usesecure === 'enable') {
    cse.mqttport = '8883';
}

conf.cse = cse;
conf.ae = ae;
conf.cnt = cnt_arr;
conf.sub = sub_arr;
conf.acp = acp;

module.exports = conf;
