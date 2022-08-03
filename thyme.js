/**
 * Created by Wonseok Jung in KETI on 2020-08-02.
 */
const concurrently = require('concurrently')

global.conf = require('./conf.js');

const {} = concurrently(
    [
        {command: "node thyme_tas_mav.js", name: "TAS_MAV", env: {conf:JSON.stringify(conf)}},
        {command: "node tele_rf.js", name: "TELE_RF", env: {conf:JSON.stringify(conf)}},
        {command: "node tele_lte.js", name: "TELE_LTE", env: {conf:JSON.stringify(conf)}},
    ],
    {
        restartTries: 5
    }
)
