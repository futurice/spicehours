(function() {
  function setOnReadyStateChange(xhr, callback) {
    xhr.onreadystatechange = function() {
      var DONE = 4;
      if (xhr.readyState === DONE) {
        if (xhr.status === 200) {
          callback(null, JSON.parse(xhr.responseText));
        } else if (xhr.status === 204) {
          callback(null);
        } else {
          callback(new Error('Server returned ' + xhr.status));
        }
      }
    }
  }

  window.getJSON = function(url, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url);
    setOnReadyStateChange(xhr, callback);
    xhr.send();
  }

  window.postJSON = function(url, data, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('Content-Type', 'application/json;charset=UTF-8');
    setOnReadyStateChange(xhr, callback);
    xhr.send(JSON.stringify(data));
  }
})();
