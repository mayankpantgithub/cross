"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const redis = require("redis");
const memcached = require("memcached");
const util = require("util");
const KEY = `account1/balance`;
const DEFAULT_BALANCE = 100;
const MAX_EXPIRATION = 60 * 60 * 24 * 30;

const redisClient = redis.createClient({
    host: process.env.ENDPOINT,
    port: parseInt(process.env.PORT || "6379"),
});

const memcachedClient = new memcached(`${process.env.ENDPOINT}:${process.env.PORT}`);

exports.chargeRequestRedis = async function (input) {
    var remainingBalance = await getBalanceRedis(redisClient, KEY);
    var charges = getCharges();

    var newBalance = await chargeRedis(redisClient, KEY, charges);
    var isAuthorized = newBalance !== null;
    return {
        remainingBalance: newBalance !== null ? newBalance : remainingBalance,
        charges: isAuthorized ? charges : 0,
        isAuthorized,
    };
};

exports.resetRedis = async function () {
    return new Promise((resolve, reject) => {
        redisClient.set(KEY, String(DEFAULT_BALANCE), (err, res) => {
            if (err) {
                reject(err);
            }
            else {
                resolve(DEFAULT_BALANCE);
            }
        });
    });
};

exports.resetMemcached = async function () {
    return new Promise((resolve, reject) => {
        memcachedClient.set(KEY, DEFAULT_BALANCE, MAX_EXPIRATION, (err, res) => {
            if (err) {
                reject(err);
            } else {
                resolve(DEFAULT_BALANCE);
            }
        });
    });
};

exports.chargeRequestMemcached = async function (input) {
    var remainingBalance = await getBalanceMemcached(KEY);
    const charges = getCharges();
    
    remainingBalance = await chargeMemcached(KEY, charges);
    const isAuthorized = remainingBalance !== null;
    return {
        remainingBalance: isAuthorized ? remainingBalance : remainingBalance,
        charges: isAuthorized ? charges : 0,
        isAuthorized,
    };
};

function getCharges() {
    return DEFAULT_BALANCE / 20;
}

async function getBalanceRedis(redisClient, key) {
    const res = await util.promisify(redisClient.get).bind(redisClient)(key);
    return parseInt(res || "0");
}

async function chargeRedis(redisClient, key, charges) {
    return new Promise((resolve, reject) => {
        redisClient.multi()
            .get(key)
            .exec((getError, [balance]) => {
                if (getError) {
                    reject(getError);
                    return;
                }

                if (balance < charges) {
                    resolve(null); // or any other signal that charge failed due to insufficient balance
                    return;
                }

                redisClient.multi()
                    .decrby(key, charges)
                    .exec((decrError, [newBalance]) => {
                        if (decrError) {
                            reject(decrError);
                        } else {
                            resolve(newBalance);
                        }
                    });
            });
    });
}

async function getBalanceMemcached(key) {
    return new Promise((resolve, reject) => {
        memcachedClient.get(key, (err, data) => {
            if (err) {
                reject(err);
            }
            else {
                resolve(Number(data));
            }
        });
    });
}

async function chargeMemcached(key, charges) {
    return new Promise((resolve, reject) => {
        memcachedClient.decr(key, charges, (err, result) => {
            if (err) {
                reject(err);
            }
            else {
                return resolve(Number(result));
            }
        });
    });
}
