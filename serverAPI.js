var http = require("http");
var URL = require("url");
var querystring = require("querystring");
var mysql = require("mysql");
var async = require("async");

var pool  = mysql.createPool({
    host     : '127.0.0.1',
    user     : 'root',
    password : '123456',
    database : 'ServiceBell'
});
function excuteMySQLQuery(query, params, callback) {
  pool.getConnection(function(err, connection) {
    if (err) {
      callback(err, null);
      return;
    };
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
  response.writeHead(200, {'Content-Type': 'text/html', 'Access-Control-Allow-Origin':'*'});
  response.write(JSON.stringify({
      success: false,
      code: 1000,
      msg: msg
      }));
  response.end();
}

function login(response, request) {
  var query = querystring.parse(URL.parse(request.url).query);
  var username = query["username"];
  var userpwd = query["userpwd"];

  excuteMySQLQuery('SELECT * FROM tb_account WHERE name=? AND pwd=?', [username, userpwd], function(err, results) {
      checkLogin(err, results, response);
    });
}

function checkLogin(err, results, response) {
  if (err) {
    console.error(err);
    responseErrorMsg(response, err);
    return;
  }
  if (results.length > 0) {
    response.writeHead(200, {'Content-Type': 'text/html', 'Access-Control-Allow-Origin':'*'});
    response.write(JSON.stringify({
      success: true,
      account: {
        id: results[0]["id"],
        name: results[0]["name"],
        shopid: results[0]["shopid"],
      }
    }));
    response.end();
  } else {
    responseErrorMsg(response, '账号或密码错误');
  }
}

function getRoom(response, request) {
  var query = querystring.parse(URL.parse(request.url).query);
  var shopId = query["shopid"];
  excuteMySQLQuery("SELECT * FROM tb_room WHERE shopid=?", [shopId], function(err, results) {
    try {
      if (err) {
        console.error(err);
        responseErrorMsg(response, err);
        return;
      }
      if (results.length > 0) {
        response.writeHead(200, {'Content-Type': 'text/html', 'Access-Control-Allow-Origin':'*'});
        response.write(JSON.stringify({
          success: true,
          roomlist: results
        }));
        response.end();
      } else {
        responseErrorMsg(response, '账号或密码错误');
      }
    } catch(err) {
      responseErrorMsg(response, err);
    }
  });
}

function getRoomStatus(response, request) {
  var query = querystring.parse(URL.parse(request.url).query);
  var shopId = query["shopid"];

  excuteMySQLQuery("SELECT * FROM tb_online WHERE shopid=?", [shopId], function(err, results) {
    if (err) {
      console.error(err);
      responseErrorMsg(response, err);
      return;
    }
    if (results.length > 0) {
      var roomStatusList = new Array();
      var userIdList = new Array();
      for (var i = 0; i < results.length; i++) {
        var result = results[i];
        var roomId = result['roomid'];
        var userId = result['userid'];
        var status = result['status'];

        var roomStatus = null;
        for (var j = 0; j < roomStatusList.length; j++) {
          if (roomStatusList[j].roomId == roomId) {
            roomStatus = roomStatusList[j];
            break;
          }
        };
        if (roomStatus == null) {
          roomStatus = new RoomStatus(roomId);
          roomStatusList.push(roomStatus);
        };

        roomStatus.addUser(userId, status);

        var isExists = false;
        for (var k = 0; k < userIdList.length; k++) {
          if (userIdList[k] == userId) {
            isExists = true;
            break;
          }
        };
        if (!isExists) {
          userIdList.push(userId);  
        };
      };

      getUserInfo(userIdList, function(userList) {
        try {
          if (userList == null) {
            responseErrorMsg(response, '获取房间状态失败');
            return;
          };
          for (var i = 0; i < roomStatusList.length; i++) {
            var roomStatus = roomStatusList[i];
            for (var j = 0; j < userList.length; j++) {
              roomStatus.fillUser(userList[j]);
            };
          };
          response.writeHead(200, {'Content-Type': 'text/html', 'Access-Control-Allow-Origin':'*', 'charset':'utf-8'});
          response.write(JSON.stringify({
            success: true,
            roomstatuslist: roomStatusList
          }));
          response.end();
        } catch(err) {
          responseErrorMsg(response, '获取房间状态失败');
        }
      });
    } else {
      response.writeHead(200, {'Content-Type': 'text/html', 'Access-Control-Allow-Origin':'*', 'charset':'utf-8'});
      response.write(JSON.stringify({
        success: true
      }));
      response.end();
    }
  });
}


function RoomStatus(roomId) {
  this.roomId = roomId;
  this.userStatusList = new Array();
};

function UserStatus(user, status) {
  this.user = user;
  this.status = status;
}

function User(userId, nick, avatar) {
  this.userId = userId;
  this.nick = nick;
  this.avatar = avatar;
}

RoomStatus.prototype = {
    addUser: function(userId, status) {
      if (typeof(status) === 'undefine' || status == null) {
        status = '无';
      };
      var userStatus = this.findUser(userId);
      if (userStatus == null) {
        var user = new User(userId);
        userStatus = new UserStatus(user, status);
        this.userStatusList.push(userStatus);  
      } else {
        userStatus.status = status;  
      }
    },
    findUser: function(userId) {
      for (var i = 0; i < this.userStatusList.length; i++) {
        var userStatus = this.userStatusList[i];
        if (userStatus.user != null && typeof(userStatus.user.userId)!='undefine' && userStatus.user.userId == userId) {
          return userStatus;
        };
      };
      return null;
    },
    fillUser: function(user) {
      var userStatus = this.findUser(user.userId);
      if (userStatus == null) {
        return;
      };
      userStatus.user.nick = user.nick;
      userStatus.user.avatar = user.avatar;
    }
};

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
        var nick = result['nick'];
        var avatar = result['avatar'];
        if (nick == null || nick.length == 0) {
          nick = '匿名';
        };
        if (avatar == null || avatar.length == 0) {
          avatar = 'avatar0.png';
        };
        userList.push(new User(result['id'], nick, "http://127.0.0.1/bell/images/avatar/"+avatar));
      };
      callback(userList);
    } else {
      callback(null);
    }
  });
}

// 响应服务铃
function responseBell(response, request) {
  var query = querystring.parse(URL.parse(request.url).query);
  var shopId = query["shopid"];
  var roomId = query["roomid"];
  var userId = query["userid"];

  async.series([
      function(updateTbOnline) {
        if (userId == null || userId.length == 0) { //响应所有
          excuteMySQLQuery("UPDATE tb_online SET status=NULL WHERE shopid=? AND roomid=?", [shopId, roomId], function(err, results) {
            updateTbOnline(err, results);
          });  
        } else {
          excuteMySQLQuery("UPDATE tb_online SET status=NULL WHERE shopid=? AND roomid=? AND userid=?", [shopId, roomId, userId], function(err, results) {
            updateTbOnline(err, results);
          });  
        }
      }
    ], function(err, results){
        if (err) {
          console.error(err);
          responseErrorMsg(response, err);
          return;
        }
        response.writeHead(200, {'Content-Type': 'text/html', 'Access-Control-Allow-Origin':'*'});
        response.write(JSON.stringify({
          success: true,
          roomid: roomId
        }));
        response.end();

        async.waterfall([
          function(findUser) {
            excuteMySQLQuery("SELECT userid FROM tb_online WHERE shopid=? AND roomid=?", [shopId, roomId], function(err, results) {
              findUser(err, results);
            });  
          },
          function(userIdList, insertMsg) {
            for (var i = 0; i < userIdList.length; i++) {
              var userId = userIdList[i]["userid"];
              excuteMySQLQuery("INSERT INTO tb_messagequeue(userid, title, content, type, action, roomid, shopid) values (?, ?, ?, ?, ?, ?, ?)", [userId, '提醒', '客官，小二马上就到~', 1, 'alert', roomId, shopId], function(err, results) {
                if (err) {
                  console.error(err);  
                };
              });    
            };
            insertMsg(null, userIdList);
          }
        ], function(err, results) {

        });
    });
  
}

function clearRoom(response, request) {
  var query = querystring.parse(URL.parse(request.url).query);
  var shopId = query["shopid"];
  var roomId = query["roomid"];

  async.waterfall([
      function(findUser) {
        excuteMySQLQuery("SELECT userid FROM tb_online WHERE shopid=? AND roomid=?", [shopId, roomId], function(err, results) {
          findUser(err, results);
        });  
      },
      function(userIdList, insertMsg) {
        for (var i = 0; i < userIdList.length; i++) {
          var userId = userIdList[i]["userid"];
          excuteMySQLQuery("INSERT INTO tb_messagequeue(userid, title, content, type, action, roomid, shopid) values (?, ?, ?, ?, ?, ?, ?)", [userId, '提醒', '请对商户服务评分', 2, 'rate', roomId, shopId], function(err, results) {
            if (err) {
              console.error(err);  
            };
          });    
        };
        insertMsg(null, userIdList);
      },
      function(userIdList, deleteRoom) {
        excuteMySQLQuery("DELETE FROM tb_online WHERE shopid=? AND roomid=?", [shopId, roomId], function(err, results) {
          deleteRoom(err, results);
        });  
      }
    ],function(err, results) {
        if (err) {
          console.error(err);
          responseErrorMsg(response, err);
          return;
        }
        response.writeHead(200, {'Content-Type': 'text/html', 'Access-Control-Allow-Origin':'*'});
        response.write(JSON.stringify({
          success: true,
          roomid: roomId
        }));
        response.end();
    });

  
}

exports.login = login;
exports.getRoom = getRoom;
exports.getRoomStatus = getRoomStatus;
exports.responseBell = responseBell;
exports.clearRoom = clearRoom;
