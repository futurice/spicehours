const _ = require('lodash/fp');
const crypto = require('crypto');
const config = require('./config');

function sha128(input) {
  let hash, digest, ret, i;

  if (!Buffer.isBuffer(input))
    throw new Error(`Invalid input for hash: ${input}`);

  hash = crypto.createHash('sha256');
  hash.update(input);
  digest = hash.digest();

  ret = Buffer.alloc(16);
  for (i=0; i<16; i++) {
    ret[i] = digest[i] ^ digest[16+i];
  }
  return ret;
}

const aesKey = sha128(Buffer.from(config.SECRET));

function encryptBytes(info) {
  if (!Buffer.isBuffer(info))
    throw new Error(`Input is not a buffer: ${info}`);
  if (info.length != 16)
    throw new Error(`Input length is too long: ${info.length}`);

  const aesIv = sha128(info);
  const buf = Buffer.alloc(16);
  for (let i=0; i<16; i++) buf[i] = aesIv[i] ^ info[i];

  const cipher = crypto.createCipher('aes-128-ecb', aesKey);
  cipher.update(buf);
  const encrypted = cipher.update(buf);
  return `0x${aesIv.toString('hex')}${encrypted.toString('hex')}`;
}

function decryptBytes(input) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(input))
    throw new Error(`Input is in invalid format: ${input}`);

  const data = Buffer.from(input.substr(2), 'hex');
  const aesIv = data.slice(0, 16);
  const encrypted = data.slice(16);
  const cipher = crypto.createDecipher('aes-128-ecb', aesKey);
  cipher.update(encrypted);
  const buf = cipher.update(encrypted);
  for (let i=0; i<16; i++) buf[i] ^= aesIv[i];
  return buf;
}

function encryptInfo(info) {
  const byteLen = Buffer.byteLength(info);
  if (byteLen > 16)
    throw new Error(`Info is too long: ${byteLen}`);

  const buf = Buffer.alloc(16);
  buf.write(info);
  return encryptBytes(buf);
}

function decryptInfo(encrypted) {
  const buf = decryptBytes(encrypted);
  for (var len=buf.length; !buf[len-1] && len>=0; len--);
  return buf.toString('utf8', 0, len);
}

function strToBytes32(str='') {
  const byteLen = Buffer.byteLength(str);
  if (byteLen > 32)
    throw new Error(`String is too long: ${byteLen}`);

  const buf = Buffer.alloc(32);
  buf.write(str);
  return `0x${buf.toString('hex')}`;
}

function bytes32ToStr(input) {
  if (_.isNil(input)) return;
  if (!/^0x[0-9a-fA-F]{64}$/.test(input))
    throw new Error(`Input is in invalid format: ${input}`);

  const buf = Buffer.from(input.substr(2), 'hex');
  for (var len=buf.length; !buf[len-1] && len>=0; len--);
  return buf.toString('utf8', 0, len);
}

exports.encryptInfo = encryptInfo;
exports.decryptInfo = decryptInfo;
exports.strToBytes32 = strToBytes32;
exports.bytes32ToStr = bytes32ToStr;
