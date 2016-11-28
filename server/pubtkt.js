const user = require('./user');

function decodePubtkt(pubtkt) {
  const output = {};
  decoded = decodeURIComponent(pubtkt);
  decodedFields = decoded.split(';');
  decodedFields.forEach(field => {
    const splittedField = field.split('=');
    if (splittedField.length == 2) {
      output[splittedField[0]] = splittedField[1];
    }
  });
  return output;
}

module.exports = function() {
  return function pubtktMiddleware(req, res, next) {
    if (req.cookies && req.cookies.auth_pubtkt) {
      req.pubtkt = decodePubtkt(req.cookies.auth_pubtkt);
    }
    next();
  }
}
