var http = require("http");
var URL = require("url");
var querystring = require("querystring");
var mysql = require("mysql");

var pool  = mysql.createPool({
    host     : 'localhost',
    user     : 'root',
    password : '123456'
});
function excuteMySQLQuery(query, params, callback) {
  pool.getConnection(function(err, connection) {
    if (err) {
      console.log(err);
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

  console.log(request.url); 
}

function checkLogin(err, results, response) {
  if (err) {
    console.log(err);
    responseErrorMsg(response, err);
    return;
  }
  if (results.length > 0) {
    console.log(results);
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
    if (err) {
      console.log(err);
      responseErrorMsg(response, err);
      return;
    }
    if (results.length > 0) {
      console.log(results);
      response.writeHead(200, {'Content-Type': 'text/html', 'Access-Control-Allow-Origin':'*'});
      response.write(JSON.stringify({
        success: true,
        roomlist: results
      }));
      response.end();
    } else {
      responseErrorMsg(response, '账号或密码错误');
    }
  });
}

function getRoomStatus(response, request) {
  var query = querystring.parse(URL.parse(request.url).query);
  var shopId = query["shopid"];
  excuteMySQLQuery("SELECT * FROM tb_online WHERE shopid=?", [shopId], function(err, results) {
    if (err) {
      console.log(err);
      responseErrorMsg(response, err);
      return;
    }
    if (results.length > 0) {
      response.writeHead(200, {'Content-Type': 'text/html', 'Access-Control-Allow-Origin':'*', 'charset':'utf-8'});

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
        for (var i = 0; i < roomStatusList.length; i++) {
          var roomStatus = roomStatusList[i];
          for (var j = 0; j < userList.length; j++) {
            roomStatus.fillUser(userList[j]);
          };
        };
        response.write(JSON.stringify({
          success: true,
          roomstatuslist: roomStatusList
        }));
        response.end();
      });
    } else {
      responseErrorMsg(response, '账号或密码错误');
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
      console.log(err);
      callback(null);
    };
    if (results.length > 0) {
      var userList = new Array();
      for (var i = 0; i < results.length; i++) {
        var result = results[i];
        userList.push(new User(result['id'], result['nick'], "http://127.0.0.1:8881/images/avatar/"+result['avatar']));
      };
      callback(userList);
    } else {
      callback(null);
    }
  });
}

exports.login = login;
exports.getRoom = getRoom;
exports.getRoomStatus = getRoomStatus;

