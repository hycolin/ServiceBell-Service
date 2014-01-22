var http = require("http");
var URL = require("url");
var querystring = require("querystring");
var mysql = require("mysql");
var async = require("async");

var pool  = mysql.createPool({
    host     : '127.0.0.1',
    user     : 'root',
    password : '123456'
});
function excuteMySQLQuery(query, params, callback) {
  pool.getConnection(function(err, connection) {
    if (err) {
      console.error(err);
      return;
    };
    connection.query('use ServiceBell');
    connection.query(query, params, function(err, results) {
      callback(err, results);
    });
    connection.release();
  });
}

function responseErrorMsg(response, msg) {
  if (typeof(msg) === 'undefine' ) {
    msg = '服务异常';
  };
  response.writeHead(200, {'Content-Type': 'text/html', 'Access-Control-Allow-Origin':'*', 'charset': 'utf-8' });
  response.write(JSON.stringify({
      success: false,
      code: 1000,
      msg: msg
      }));
  response.end();
}

function gotoroom(response, request) {
  var query = querystring.parse(URL.parse(request.url).query);
  var shopid = query["shopid"];
  var roomid = query["roomid"];
  var userid = query["userid"];

  excuteMySQLQuery("SELECT * FROM tb_room WHERE shopid=? AND id=?", [shopid, roomid], function(err, results) {
    if (err || results.length == 0) {
      console.error(err);
      responseErrorMsg(response, err);
      return;
    } 
    var status = results[0]['status'];
    if (status == '1') { //已预约
      responseErrorMsg(response, "此房间已被预约");
      return;
    };
    if (status == '2') { //暂停
      responseErrorMsg(response, "此房间暂停使用");
      return;
    };
    async.waterfall(
    [
      function(selectOnline) {
        excuteMySQLQuery('SELECT * FROM tb_online WHERE userid=? AND shopid=? AND roomid=?', [userid, shopid,roomid], function(err, results) {
          selectOnline(err, results);
        });
      },
      function(results, insertRoom) {
        if (results.length > 0) {
          insertRoom(null, results);
        } else {
          excuteMySQLQuery('INSERT INTO tb_online (userid,shopid,roomid) VALUES(?,?,?)', [userid, shopid,roomid], function(err, results) {
            insertRoom(err, results);
          }); 
        }
      },
      function(results, clearOldMessage) {
        excuteMySQLQuery('DELETE FROM tb_messagequeue WHERE userid=?', [userid], function(err, results) {
          clearOldMessage(err, results);
        });
      },
      function(results, selectRoom) {
        excuteMySQLQuery("SELECT * FROM tb_room WHERE shopid=? AND id=?", [shopid, roomid], function(err, results) {
          selectRoom(err, results);
        });
      }
    ], 
    function(err, results) {
      if (err || results.length == 0) {
        console.error(err);
        responseErrorMsg(response, err);
        return;
      }
      response.writeHead(200, {'Content-Type': 'text/html', 'Access-Control-Allow-Origin':'*','charset': 'utf-8'});
      response.write(JSON.stringify({
        success: true,
        room: results[0]
      }));
      response.end();
    }); 
  });
}

function exitroom(response, request) {
  var query = querystring.parse(URL.parse(request.url).query);
  var shopid = query["shopid"];
  var roomid = query["roomid"];
  var userid = query["userid"];
  async.series([
      function(deleteOnline) {
        excuteMySQLQuery('DELETE FROM tb_online WHERE userid=? AND shopid=? AND roomid=?', [userid, shopid,roomid], function(err, results) {
          deleteOnline(err, results);
        }); 
      },
      function(insertMessage) {
        excuteMySQLQuery("INSERT INTO tb_messagequeue(userid, title, content, type, action, roomid, shopid) values (?, ?, ?, ?, ?, ?, ?)", [userid, '提醒', '请对商户服务评分', 2, 'rate', roomid, shopid], function(err, results) {
          insertMessage(err, results);
        });    
      }
    ],
    function(err, results) {
      if (err) {
        console.error(err);
        responseErrorMsg(response, err);
        return;
      }
      response.writeHead(200, {'Content-Type': 'text/html', 'Access-Control-Allow-Origin':'*','charset': 'utf-8'});
      response.write(JSON.stringify({
        success: true
      }));
      response.end();
    });
  
}

function bell(response, request) {
  var query = querystring.parse(URL.parse(request.url).query);
  var shopid = query["shopid"];
  var userid = query["userid"];
  var roomid = query["roomid"];
  var status = query["status"];

  excuteMySQLQuery('UPDATE tb_online SET status=? WHERE userid=? AND shopid=? AND roomid=?', [status, userid, shopid,roomid], function(err, results) {
    if (err) {
      console.error(err);
      responseErrorMsg(response, err);
      return;
    }
    response.writeHead(200, {'Content-Type': 'text/html', 'Access-Control-Allow-Origin':'*','charset': 'utf-8'});
    response.write(JSON.stringify({
      success: true
    }));
    response.end();
  });
}

function shop(response, request) {
  var query = querystring.parse(URL.parse(request.url).query);
  var shopid = query["shopid"];
  excuteMySQLQuery('SELECT * FROM tb_shop WHERE id=?', [shopid], function(err, results) {
    if (err) {
      console.error(err);
      responseErrorMsg(response, err);
      return;
    }
    if (results.length > 0) {
      response.writeHead(200, {'Content-Type': 'text/html', 'Access-Control-Allow-Origin':'*','charset': 'utf-8'});
      response.write(JSON.stringify({
        success: true,
        shop: results[0]
      }));
      response.end();
    };
  });
}

function userlogin(response, request) {
  var query = querystring.parse(URL.parse(request.url).query);
  var deviceid = query["deviceid"];

  excuteMySQLQuery('SELECT * FROM tb_deviceid WHERE deviceid=?', [deviceid], function(err, results) {
    if (err) {
      console.error(err);
      responseErrorMsg(response, err);
      return;
    }
    if (results.length > 0) {
      var userid = results[0]["id"];
      getUserInfo([userid], function(userList) {
        if (userList != null && userList.length > 0) {
            response.writeHead(200, {'Content-Type': 'text/html', 'Access-Control-Allow-Origin':'*','charset': 'utf-8'});
            response.write(JSON.stringify({
              success: true,
              user: userList[0]
            }));
            response.end();
        } else {
          responseErrorMsg(response, err);
        }
      });
    } else {
      excuteMySQLQuery('INSERT INTO tb_deviceid (deviceid) VALUES(?)', [deviceid], function(err, results) {
        if (err) {
          console.error(err);
          responseErrorMsg(response, err);
          return;
        }
        excuteMySQLQuery('SELECT * FROM tb_deviceid WHERE deviceid=?', [deviceid], function(err, results) {
          if (err) {
            console.error(err);
            responseErrorMsg(response, err);
            return;
          }
          if (results.length > 0) {
            var userid = results[0]["id"];
            excuteMySQLQuery('INSERT INTO tb_user (id, nick, avatar) VALUES(?,?,?)', [userid, '匿名', 'avatar0.png'], function(err, results) {
              if (err) {
                console.error(err);
                responseErrorMsg(response, err);
                return;
              }
              getUserInfo([userid], function(userList) {
                if (userList.length > 0) {
                    response.writeHead(200, {'Content-Type': 'text/html', 'Access-Control-Allow-Origin':'*','charset': 'utf-8'});
                    response.write(JSON.stringify({
                      success: true,
                      user: userList[0]
                    }));
                    response.end();
                } else {
                  responseErrorMsg(response, err);
                }
              });
            });
          } else {
            responseErrorMsg(response, "注册失败");
          }
        });
      });
    }
  });
}

// 查询用户信息
function getUserInfo(userIdList, callback) {
  if (userIdList == null || userIdList.length == 0) {
    callback(null);
  };
  var sql = "SELECT * FROM tb_user WHERE id in(";
  for (var i = 0; i < userIdList.length; i++) {
    sql = sql + userIdList[i] + ",";
  };
  sql = sql.substring(0, sql.length-1) + ")";
  excuteMySQLQuery(sql, function(err, results) {
    if (err) {
      console.error(err);
      callback(null);
    };
    if (results.length > 0) {
      var userList = new Array();
      for (var i = 0; i < results.length; i++) {
        var result = results[i];
        userList.push(new User(result['id'], result['nick'], "http://127.0.0.1/bell/images/avatar/"+result['avatar']));
      };
      callback(userList);
    } else {
      callback(null);
    }
  });
}

function User(userId, nick, avatar) {
  this.userId = userId;
  this.nick = nick;
  this.avatar = avatar;
}

function unreadmessage(response, request) {
  var query = querystring.parse(URL.parse(request.url).query);
  var userid = query["userid"];
  async.series([
      function(selectMessage) {
        excuteMySQLQuery('SELECT * FROM tb_messagequeue WHERE userid=? ORDER BY time DESC', [userid], function(err, results) {
          selectMessage(err, results);
        });
      },
      function(deleteMessage) {
        excuteMySQLQuery('DELETE FROM tb_messagequeue WHERE userid=? AND type=1', [userid], function(err, results) {
          deleteMessage(err);
        });
      }
    ],
    function(err, results) {
      if (err) {
        console.error(err);
        responseErrorMsg(response, err);
        return;
      }
      response.writeHead(200, {'Content-Type': 'text/html;charset:utf-8', 'Access-Control-Allow-Origin':'*'});
      response.write(JSON.stringify({
        success: true,
        bellmsglist: results[0]
      }));
      response.end();
    });
  
}

function readmsg(response, request) {
  var query = querystring.parse(URL.parse(request.url).query);
  var userid = query["userid"];
  var messageid = query["messageid"];
  if (messageid != null && messageid == '-1') { //读取所有消息
    excuteMySQLQuery("DELETE FROM tb_messagequeue WHERE userid=?", [userid], function(err, results) {
      if (err) {
        console.error(err);
        responseErrorMsg(response, err);
        return;
      }
      response.writeHead(200, {'Content-Type': 'text/html', 'Access-Control-Allow-Origin':'*','charset': 'utf-8'});
      response.write(JSON.stringify({
        success: true
      }));
      response.end();
    }); 
  } else {
    excuteMySQLQuery("DELETE FROM tb_messagequeue WHERE userid=? AND id=?", [userid, messageid], function(err, results) {
      if (err) {
        console.error(err);
        responseErrorMsg(response, err);
        return;
      }
      response.writeHead(200, {'Content-Type': 'text/html', 'Access-Control-Allow-Origin':'*','charset': 'utf-8'});
      response.write(JSON.stringify({
        success: true
      }));
      response.end();
    }); 
  }
}

function rate(response, request) {
  var query = querystring.parse(URL.parse(request.url).query);
  var userid = query["userid"];
  var shopid = query["shopid"];
  var rate = query["rate"];
  if (rate == null || rate.length == 0
    || userid == null || userid.length == 0
    || shopid == null || shopid.length == 0
    ) {
    responseErrorMsg(response, "缺少必要参数");
    return;
  };
  async.waterfall(
    [
      function(selectShopRate) {
        excuteMySQLQuery('SELECT rate FROM tb_shop WHERE id=?', [shopid], function(err, results) {
          if (results.length > 0) {
            selectShopRate(err, results[0]['rate']);
          } else {
            selectShopRate(err, 0);
          }
          
        });
      },
      function(oldRate, updateShopRate) {
        var realRate = rate;
        if (parseInt(oldRate) > 0) {
          realRate = (parseInt(oldRate) + parseInt(rate))/2;
        };
        excuteMySQLQuery('UPDATE tb_shop SET rate=? WHERE id=?', [rate, shopid], function(err, results) {
          updateShopRate(err, results);
        });
      },
      function(results, exitRoom) {
        excuteMySQLQuery("DELETE FROM tb_online WHERE shopid=? AND userid=?", [shopid, userid], function(err, results) {
          exitRoom(err, results);
        }); 
      }
    ], 
    function(err, results) {
      if (err) {
        console.error(err);
        responseErrorMsg(response, err);
        return;
      }
      response.writeHead(200, {'Content-Type': 'text/html', 'Access-Control-Allow-Origin':'*','charset': 'utf-8'});
      response.write(JSON.stringify({
        success: true
      }));
      response.end();
    });
}

function updatenick(response, request) {
  var query = querystring.parse(URL.parse(request.url).query);
  var userid = query["userid"];
  var nick = query["nick"];
  excuteMySQLQuery('UPDATE tb_user SET nick=? WHERE id=?', [nick, userid], function(err, results) {
      if (err) {
        console.error(err);
        responseErrorMsg(response, err);
        return;
      }
      response.writeHead(200, {'Content-Type': 'text/html', 'Access-Control-Allow-Origin':'*','charset': 'utf-8'});
      response.write(JSON.stringify({
        success: true,
        nick: nick
      }));
      response.end();   
  });
}

exports.userlogin = userlogin;
exports.gotoroom = gotoroom;
exports.exitroom = exitroom;
exports.bell = bell;
exports.shop = shop;
exports.unreadmessage = unreadmessage;
exports.rate = rate;
exports.readmsg = readmsg;
exports.updatenick = updatenick;
