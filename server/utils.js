const _ = require('lodash/fp');
const crypto = require('crypto');
const config = require('./config');

function keyHash(keystr) {
  let hash, digest, ret, i;

  if (!_.isString(keystr))
    throw new Error(`Invalid secret in config: ${keystr}`);

  hash = crypto.createHash('sha256');
  hash.update(Buffer.from(keystr));
  digest = hash.digest();

  ret = Buffer.alloc(16);
  for (i=0; i<16; i++) {
    ret[i] = digest[i] ^ digest[16+i];
  }
  return ret;
}

const aesKey = keyHash(config.SECRET);

function encryptBytes(info) {
  if (!Buffer.isBuffer(info))
    throw new Error(`Input is not a buffer: ${info}`);
  if (info.length != 16)
    throw new Error(`Input length is too long: ${info.length}`);

  const aesIv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-128-cbc', aesKey, aesIv);
  cipher.update(info);
  const encrypted = Buffer.concat([aesIv, cipher.final()]);
  return `0x${encrypted.toString('hex')}`;
}

function decryptBytes(input) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(input))
    throw new Error(`Input is in invalid format: ${input}`);

  const data = Buffer.from(input.substr(2), 'hex');
  const aesIv = data.slice(0, 16);
  const encrypted = data.slice(16);
  const cipher = crypto.createDecipheriv('aes-128-cbc', aesKey, aesIv);
  cipher.update(encrypted);
  return cipher.final();
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
  const buf = decryptBytes(data);
  for (let len=buf.length; !buf[len-1] && len>=0; len--);
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

exports.encryptInfo = encryptInfo;
exports.decryptInfo = decryptInfo;
exports.strToBytes32 = strToBytes32;
