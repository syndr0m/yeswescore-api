var mongoose = require("mongoose"),
    Schema = mongoose.Schema,
    Conf = require("./conf.js"),
    Q = require("q");

mongoose.connection.on('error', function () { DB.status = "disconnected" });
mongoose.connection.on('connected', function () { DB.status = "connected" });
mongoose.connect(Conf.get("mongo.url"));

var DB = {
  status : "disconnected",
  
  // mongoose data.
  Definition: { },  // schema definitions
  Schema: { },      // mongoose schemas
  Model: { },       // mongoose models
  
  /*
   * Saving one or many mongo documents.
   * 
   * ex: 
   *   var player = new DB.Model.Player({ "name" : "vincent" });
   *   DB.saveAsync(player).then(
   *     function success() { console.log('saved') },
   *     function error() { console.log('error') }
   *   );
   * 
   * ex:
   *   var playerA = new DB.Model.Player({ "name" : "vincent" });
   *   var playerB = new DB.Model.Player({ "name" : "marc" });
   *   DB.saveAsync([playerA, playerB])
   *     .then(
   *     function success(players) {
   *        console.log(players.length + ' models saved')
   *     },
   *     function error() { console.log('error') }
   *   );
   */
  saveAsync: function (doc) {
    if (Array.isArray(doc)) {
      var promises = doc.map(function _save(doc) {
        var simpleDeferred = Q.defer();
        // saving
        doc.save(function (err) {
          if (err) {
            simpleDeferred.reject(err);
          } else {
            simpleDeferred.resolve(doc);
          }
        });
        return simpleDeferred.promise;
      });
      //
      return Q.all(promises);
    } else {
      var simpleDeferred = Q.defer();
      doc.save(function (err) {
        if (err) {
          simpleDeferred.reject(err);
        } else {
          simpleDeferred.resolve(doc);
        }
      });
      return simpleDeferred.promise;
    }
  },
  
  /**
   * Read a random model from a model collection.
   * ex:
   *   DB.getRandomModelAsync(DB.Model.Player)
   *     .then(function (randomPlayer) {
   *        console.log("got a randomPlayer ! ");
   *     });
   */
  getRandomModelAsync : function (model) {
    var deferred = Q.defer();
    //
    model.count({}, function (err, nb) {
      if (err)
        return deferred.reject(err);
      var randomIndex = Math.floor(Math.random() * nb);
      model.find({}).skip(randomIndex).limit(1).exec(function (err, result) {
        if (err)
          return deferred.reject(err);
        return deferred.resolve(result[0]);
      });
    });
    return deferred.promise;
  }
};

//
// Definitions
//
DB.Definition.Club = {
  sport: String,
  date_creation: { type: Date, default: Date.now },
  name: String,
  city: String
};
DB.Definition.Player = {
  nickname: String,
  name: String,
  date_creation: { type: Date, default: Date.now },
  date_modification: Date,
  password: String,
  token: String,
  rank: String,
  club: { type: Schema.Types.ObjectId, ref: "Club" },
  games: [ { type: Schema.Types.ObjectId, ref: "Game" } ]  
};
DB.Definition.Team = {
  players: [ {
    id: { type: Schema.Types.ObjectId, ref: "Player" },
    name: String,
    service: { type: Boolean, default: false }
  } ],
  points: String
};
DB.Definition.StreamItem = {
  date_creation: { type: Date, default: Date.now },
  date_modification: Date,
  type: { type: String, enum: [ "comment" ] },
  owner: { type: Schema.Types.ObjectId, ref: "Player" },
  data: Schema.Types.Mixed
};
// WE must instantiate Team & Stream Schema FIRST.
DB.Schema.Team = new Schema(DB.Definition.Team);
DB.Schema.StreamItem = new Schema(DB.Definition.StreamItem);
// 
DB.Definition.Game = {
  date_creation: { type: Date, default: Date.now },
  date_modification: Date,
  date_start: { type: Date, default: Date.now },
  date_end: Date,
  owner: { type: Schema.Types.ObjectId, ref: "Player" },
  pos: {type: [Number], index: '2d'},
  country: String,
  city: String,
  sport: { type: String, enum: ["tennis"] },
  type: { type: String, enum: [ "singles", "doubles" ] },
  sets: String,
  teams: [ DB.Schema.Team ],
  stream: [ DB.Schema.StreamItem ]  
};

//
// Schemas
//
DB.Schema.Club = new Schema(DB.Definition.Club);
DB.Schema.Player = new Schema(DB.Definition.Player);
DB.Schema.Game = new Schema(DB.Definition.Game);
// Schemas options
for (var schemaName in DB.Schema) {
  (function (schema) {
    // Adding transform default func
    schema.options.toObject = {
      transform : function (doc, ret, options) {
        var hide = schema.options.toObject.hide;
        if (options.unhide) {
          hide = hide.slice(); // clone
          options.unhide.forEach(function (field) { hide.remove(field) });
        }
        // removing hidden fields
        hide.forEach(function (prop) { delete ret[prop] });
      }
    };
  })(DB.Schema[schemaName]);
}
// hidden fields
DB.Schema.Team.options.toObject.hide = [ "_id", "__v" ];
DB.Schema.StreamItem.options.toObject.hide = [ "_id", "__v" ];
DB.Schema.Club.options.toObject.hide = [ "_id", "__v" ];
DB.Schema.Player.options.toObject.hide = [ "_id", "__v", "password", "token"];
DB.Schema.Game.options.toObject.hide = [ "_id", "__v" ];

//
// Models
//
DB.Model.Club = mongoose.model("Club", DB.Schema.Club);
DB.Model.Player = mongoose.model("Player", DB.Schema.Player);
DB.Model.Game = mongoose.model("Game", DB.Schema.Game);

// custom JSON api
JSON.stringifyModels = function (m, options) {
  options = options || {};
  if (options && typeof options.virtuals === "undefined")
    options.virtuals = true;
  if (options && typeof options.transform === "undefined")
    options.transform = true;
  if (Array.isArray(m)) {
    return JSON.stringify(m.map(function (model) {
      return model.toObject(options);
    }));
  }
  return JSON.stringify(m.toObject(options));
};

// random api
if (Conf.env === "DEV") {
  DB.Model.Club.randomAsync = function () { return DB.getRandomModelAsync(DB.Model.Club); };
  DB.Model.Player.randomAsync = function () { return DB.getRandomModelAsync(DB.Model.Player); };
  DB.Model.Game.randomAsync = function () { return DB.getRandomModelAsync(DB.Model.Game); };
}

// @see http://lehelk.com/2011/05/06/script-to-remove-diacritics/
// evaluated once; using closure.
var defaultDiacriticsRemovalMap = [
    { 'base': 'A', 'letters': /[\u0041\u24B6\uFF21\u00C0\u00C1\u00C2\u1EA6\u1EA4\u1EAA\u1EA8\u00C3\u0100\u0102\u1EB0\u1EAE\u1EB4\u1EB2\u0226\u01E0\u00C4\u01DE\u1EA2\u00C5\u01FA\u01CD\u0200\u0202\u1EA0\u1EAC\u1EB6\u1E00\u0104\u023A\u2C6F]/g },
    { 'base': 'AA', 'letters': /[\uA732]/g },
    { 'base': 'AE', 'letters': /[\u00C6\u01FC\u01E2]/g },
    { 'base': 'AO', 'letters': /[\uA734]/g },
    { 'base': 'AU', 'letters': /[\uA736]/g },
    { 'base': 'AV', 'letters': /[\uA738\uA73A]/g },
    { 'base': 'AY', 'letters': /[\uA73C]/g },
    { 'base': 'B', 'letters': /[\u0042\u24B7\uFF22\u1E02\u1E04\u1E06\u0243\u0182\u0181]/g },
    { 'base': 'C', 'letters': /[\u0043\u24B8\uFF23\u0106\u0108\u010A\u010C\u00C7\u1E08\u0187\u023B\uA73E]/g },
    { 'base': 'D', 'letters': /[\u0044\u24B9\uFF24\u1E0A\u010E\u1E0C\u1E10\u1E12\u1E0E\u0110\u018B\u018A\u0189\uA779]/g },
    { 'base': 'DZ', 'letters': /[\u01F1\u01C4]/g },
    { 'base': 'Dz', 'letters': /[\u01F2\u01C5]/g },
    { 'base': 'E', 'letters': /[\u0045\u24BA\uFF25\u00C8\u00C9\u00CA\u1EC0\u1EBE\u1EC4\u1EC2\u1EBC\u0112\u1E14\u1E16\u0114\u0116\u00CB\u1EBA\u011A\u0204\u0206\u1EB8\u1EC6\u0228\u1E1C\u0118\u1E18\u1E1A\u0190\u018E]/g },
    { 'base': 'F', 'letters': /[\u0046\u24BB\uFF26\u1E1E\u0191\uA77B]/g },
    { 'base': 'G', 'letters': /[\u0047\u24BC\uFF27\u01F4\u011C\u1E20\u011E\u0120\u01E6\u0122\u01E4\u0193\uA7A0\uA77D\uA77E]/g },
    { 'base': 'H', 'letters': /[\u0048\u24BD\uFF28\u0124\u1E22\u1E26\u021E\u1E24\u1E28\u1E2A\u0126\u2C67\u2C75\uA78D]/g },
    { 'base': 'I', 'letters': /[\u0049\u24BE\uFF29\u00CC\u00CD\u00CE\u0128\u012A\u012C\u0130\u00CF\u1E2E\u1EC8\u01CF\u0208\u020A\u1ECA\u012E\u1E2C\u0197]/g },
    { 'base': 'J', 'letters': /[\u004A\u24BF\uFF2A\u0134\u0248]/g },
    { 'base': 'K', 'letters': /[\u004B\u24C0\uFF2B\u1E30\u01E8\u1E32\u0136\u1E34\u0198\u2C69\uA740\uA742\uA744\uA7A2]/g },
    { 'base': 'L', 'letters': /[\u004C\u24C1\uFF2C\u013F\u0139\u013D\u1E36\u1E38\u013B\u1E3C\u1E3A\u0141\u023D\u2C62\u2C60\uA748\uA746\uA780]/g },
    { 'base': 'LJ', 'letters': /[\u01C7]/g },
    { 'base': 'Lj', 'letters': /[\u01C8]/g },
    { 'base': 'M', 'letters': /[\u004D\u24C2\uFF2D\u1E3E\u1E40\u1E42\u2C6E\u019C]/g },
    { 'base': 'N', 'letters': /[\u004E\u24C3\uFF2E\u01F8\u0143\u00D1\u1E44\u0147\u1E46\u0145\u1E4A\u1E48\u0220\u019D\uA790\uA7A4]/g },
    { 'base': 'NJ', 'letters': /[\u01CA]/g },
    { 'base': 'Nj', 'letters': /[\u01CB]/g },
    { 'base': 'O', 'letters': /[\u004F\u24C4\uFF2F\u00D2\u00D3\u00D4\u1ED2\u1ED0\u1ED6\u1ED4\u00D5\u1E4C\u022C\u1E4E\u014C\u1E50\u1E52\u014E\u022E\u0230\u00D6\u022A\u1ECE\u0150\u01D1\u020C\u020E\u01A0\u1EDC\u1EDA\u1EE0\u1EDE\u1EE2\u1ECC\u1ED8\u01EA\u01EC\u00D8\u01FE\u0186\u019F\uA74A\uA74C]/g },
    { 'base': 'OI', 'letters': /[\u01A2]/g },
    { 'base': 'OO', 'letters': /[\uA74E]/g },
    { 'base': 'OU', 'letters': /[\u0222]/g },
    { 'base': 'P', 'letters': /[\u0050\u24C5\uFF30\u1E54\u1E56\u01A4\u2C63\uA750\uA752\uA754]/g },
    { 'base': 'Q', 'letters': /[\u0051\u24C6\uFF31\uA756\uA758\u024A]/g },
    { 'base': 'R', 'letters': /[\u0052\u24C7\uFF32\u0154\u1E58\u0158\u0210\u0212\u1E5A\u1E5C\u0156\u1E5E\u024C\u2C64\uA75A\uA7A6\uA782]/g },
    { 'base': 'S', 'letters': /[\u0053\u24C8\uFF33\u1E9E\u015A\u1E64\u015C\u1E60\u0160\u1E66\u1E62\u1E68\u0218\u015E\u2C7E\uA7A8\uA784]/g },
    { 'base': 'T', 'letters': /[\u0054\u24C9\uFF34\u1E6A\u0164\u1E6C\u021A\u0162\u1E70\u1E6E\u0166\u01AC\u01AE\u023E\uA786]/g },
    { 'base': 'TZ', 'letters': /[\uA728]/g },
    { 'base': 'U', 'letters': /[\u0055\u24CA\uFF35\u00D9\u00DA\u00DB\u0168\u1E78\u016A\u1E7A\u016C\u00DC\u01DB\u01D7\u01D5\u01D9\u1EE6\u016E\u0170\u01D3\u0214\u0216\u01AF\u1EEA\u1EE8\u1EEE\u1EEC\u1EF0\u1EE4\u1E72\u0172\u1E76\u1E74\u0244]/g },
    { 'base': 'V', 'letters': /[\u0056\u24CB\uFF36\u1E7C\u1E7E\u01B2\uA75E\u0245]/g },
    { 'base': 'VY', 'letters': /[\uA760]/g },
    { 'base': 'W', 'letters': /[\u0057\u24CC\uFF37\u1E80\u1E82\u0174\u1E86\u1E84\u1E88\u2C72]/g },
    { 'base': 'X', 'letters': /[\u0058\u24CD\uFF38\u1E8A\u1E8C]/g },
    { 'base': 'Y', 'letters': /[\u0059\u24CE\uFF39\u1EF2\u00DD\u0176\u1EF8\u0232\u1E8E\u0178\u1EF6\u1EF4\u01B3\u024E\u1EFE]/g },
    { 'base': 'Z', 'letters': /[\u005A\u24CF\uFF3A\u0179\u1E90\u017B\u017D\u1E92\u1E94\u01B5\u0224\u2C7F\u2C6B\uA762]/g },
    { 'base': 'a', 'letters': /[\u0061\u24D0\uFF41\u1E9A\u00E0\u00E1\u00E2\u1EA7\u1EA5\u1EAB\u1EA9\u00E3\u0101\u0103\u1EB1\u1EAF\u1EB5\u1EB3\u0227\u01E1\u00E4\u01DF\u1EA3\u00E5\u01FB\u01CE\u0201\u0203\u1EA1\u1EAD\u1EB7\u1E01\u0105\u2C65\u0250]/g },
    { 'base': 'aa', 'letters': /[\uA733]/g },
    { 'base': 'ae', 'letters': /[\u00E6\u01FD\u01E3]/g },
    { 'base': 'ao', 'letters': /[\uA735]/g },
    { 'base': 'au', 'letters': /[\uA737]/g },
    { 'base': 'av', 'letters': /[\uA739\uA73B]/g },
    { 'base': 'ay', 'letters': /[\uA73D]/g },
    { 'base': 'b', 'letters': /[\u0062\u24D1\uFF42\u1E03\u1E05\u1E07\u0180\u0183\u0253]/g },
    { 'base': 'c', 'letters': /[\u0063\u24D2\uFF43\u0107\u0109\u010B\u010D\u00E7\u1E09\u0188\u023C\uA73F\u2184]/g },
    { 'base': 'd', 'letters': /[\u0064\u24D3\uFF44\u1E0B\u010F\u1E0D\u1E11\u1E13\u1E0F\u0111\u018C\u0256\u0257\uA77A]/g },
    { 'base': 'dz', 'letters': /[\u01F3\u01C6]/g },
    { 'base': 'e', 'letters': /[\u0065\u24D4\uFF45\u00E8\u00E9\u00EA\u1EC1\u1EBF\u1EC5\u1EC3\u1EBD\u0113\u1E15\u1E17\u0115\u0117\u00EB\u1EBB\u011B\u0205\u0207\u1EB9\u1EC7\u0229\u1E1D\u0119\u1E19\u1E1B\u0247\u025B\u01DD]/g },
    { 'base': 'f', 'letters': /[\u0066\u24D5\uFF46\u1E1F\u0192\uA77C]/g },
    { 'base': 'g', 'letters': /[\u0067\u24D6\uFF47\u01F5\u011D\u1E21\u011F\u0121\u01E7\u0123\u01E5\u0260\uA7A1\u1D79\uA77F]/g },
    { 'base': 'h', 'letters': /[\u0068\u24D7\uFF48\u0125\u1E23\u1E27\u021F\u1E25\u1E29\u1E2B\u1E96\u0127\u2C68\u2C76\u0265]/g },
    { 'base': 'hv', 'letters': /[\u0195]/g },
    { 'base': 'i', 'letters': /[\u0069\u24D8\uFF49\u00EC\u00ED\u00EE\u0129\u012B\u012D\u00EF\u1E2F\u1EC9\u01D0\u0209\u020B\u1ECB\u012F\u1E2D\u0268\u0131]/g },
    { 'base': 'j', 'letters': /[\u006A\u24D9\uFF4A\u0135\u01F0\u0249]/g },
    { 'base': 'k', 'letters': /[\u006B\u24DA\uFF4B\u1E31\u01E9\u1E33\u0137\u1E35\u0199\u2C6A\uA741\uA743\uA745\uA7A3]/g },
    { 'base': 'l', 'letters': /[\u006C\u24DB\uFF4C\u0140\u013A\u013E\u1E37\u1E39\u013C\u1E3D\u1E3B\u017F\u0142\u019A\u026B\u2C61\uA749\uA781\uA747]/g },
    { 'base': 'lj', 'letters': /[\u01C9]/g },
    { 'base': 'm', 'letters': /[\u006D\u24DC\uFF4D\u1E3F\u1E41\u1E43\u0271\u026F]/g },
    { 'base': 'n', 'letters': /[\u006E\u24DD\uFF4E\u01F9\u0144\u00F1\u1E45\u0148\u1E47\u0146\u1E4B\u1E49\u019E\u0272\u0149\uA791\uA7A5]/g },
    { 'base': 'nj', 'letters': /[\u01CC]/g },
    { 'base': 'o', 'letters': /[\u006F\u24DE\uFF4F\u00F2\u00F3\u00F4\u1ED3\u1ED1\u1ED7\u1ED5\u00F5\u1E4D\u022D\u1E4F\u014D\u1E51\u1E53\u014F\u022F\u0231\u00F6\u022B\u1ECF\u0151\u01D2\u020D\u020F\u01A1\u1EDD\u1EDB\u1EE1\u1EDF\u1EE3\u1ECD\u1ED9\u01EB\u01ED\u00F8\u01FF\u0254\uA74B\uA74D\u0275]/g },
    { 'base': 'oi', 'letters': /[\u01A3]/g },
    { 'base': 'ou', 'letters': /[\u0223]/g },
    { 'base': 'oo', 'letters': /[\uA74F]/g },
    { 'base': 'p', 'letters': /[\u0070\u24DF\uFF50\u1E55\u1E57\u01A5\u1D7D\uA751\uA753\uA755]/g },
    { 'base': 'q', 'letters': /[\u0071\u24E0\uFF51\u024B\uA757\uA759]/g },
    { 'base': 'r', 'letters': /[\u0072\u24E1\uFF52\u0155\u1E59\u0159\u0211\u0213\u1E5B\u1E5D\u0157\u1E5F\u024D\u027D\uA75B\uA7A7\uA783]/g },
    { 'base': 's', 'letters': /[\u0073\u24E2\uFF53\u00DF\u015B\u1E65\u015D\u1E61\u0161\u1E67\u1E63\u1E69\u0219\u015F\u023F\uA7A9\uA785\u1E9B]/g },
    { 'base': 't', 'letters': /[\u0074\u24E3\uFF54\u1E6B\u1E97\u0165\u1E6D\u021B\u0163\u1E71\u1E6F\u0167\u01AD\u0288\u2C66\uA787]/g },
    { 'base': 'tz', 'letters': /[\uA729]/g },
    { 'base': 'u', 'letters': /[\u0075\u24E4\uFF55\u00F9\u00FA\u00FB\u0169\u1E79\u016B\u1E7B\u016D\u00FC\u01DC\u01D8\u01D6\u01DA\u1EE7\u016F\u0171\u01D4\u0215\u0217\u01B0\u1EEB\u1EE9\u1EEF\u1EED\u1EF1\u1EE5\u1E73\u0173\u1E77\u1E75\u0289]/g },
    { 'base': 'v', 'letters': /[\u0076\u24E5\uFF56\u1E7D\u1E7F\u028B\uA75F\u028C]/g },
    { 'base': 'vy', 'letters': /[\uA761]/g },
    { 'base': 'w', 'letters': /[\u0077\u24E6\uFF57\u1E81\u1E83\u0175\u1E87\u1E85\u1E98\u1E89\u2C73]/g },
    { 'base': 'x', 'letters': /[\u0078\u24E7\uFF58\u1E8B\u1E8D]/g },
    { 'base': 'y', 'letters': /[\u0079\u24E8\uFF59\u1EF3\u00FD\u0177\u1EF9\u0233\u1E8F\u00FF\u1EF7\u1E99\u1EF5\u01B4\u024F\u1EFF]/g },
    { 'base': 'z', 'letters': /[\u007A\u24E9\uFF5A\u017A\u1E91\u017C\u017E\u1E93\u1E95\u01B6\u0225\u0240\u2C6C\uA763]/g }
];
String.prototype.removeDiacritics = function () {
    var str = this;
    for (var i = 0; i < defaultDiacriticsRemovalMap.length; i++) {
        str = str.replace(defaultDiacriticsRemovalMap[i].letters, defaultDiacriticsRemovalMap[i].base);
    }
    return str;
};

// fonctions de generation de contenu
var generateFakeId = function () { 
  var s = ""
    , hexa = "0123456789abcdef";
    
  for (var i = 0; i < 24; ++i)
    s += hexa[Math.floor(Math.random() * hexa.length)];
  return s
}
var generateFakeName = function () {
  return [ "Garcia", "Blanc", "Serra", "Guisset", "Martinez", "Mas", "Pla", "Sola", "Lopez", "Torrès", "Gil", "Richard",
           "Sanchez", "Simon", "Esteve", "Salvat", "Vidal", "Bertrand", "Bonnet", "Mestres", "Perez", "Batlle" ].random();
}
var generateFakeFirstName = function () {
  return [ "Agathe","Aliénor","Alix","Ambre","Apolline","Athénaïs","Axelle","Camille","Capucine","Celeste","Charlotte",
           "Chloé","Clarisse","Emma","Eva","Gabrielle","isaure","Jade","Juliette","leonore","Louise","Margaux","Mathilde",
           "Maya","Romane","Rose","Roxane","Violette","Zélie","Zoé"].random();
}
var generateFakePseudo = function () {
  return [ "Lamasperge","Kenex","JuniorGong","TelQuel","Danka","CanardPC","Mormon","DoofyGilmore","Cawotte_","Perle_Blanche","Ggate",
           "C0mE_oN_And_TrY","drj-sg","JavierHernandez","noelstyle","BadReputation","GrenierDuJoueur","CumOnAndTry","LosAngeles",
           "PetDeHap","idontknowhy","PEPSl","FenetrePVC","20thCenturyBoy","Titilabille","[B2OOBA]","SmashinPumpkins","Despe","EveryoneSuck","8mai1945"].random();
}
var generateFakeCity = function () {
  return [ "Bayeux", "Falaise", "Caen", "Honfleur", "Deauville", "Arromanches les Bains", "Lisieux", "Cabourg",
           "Trouville sur Mer", "Mont Saint Michel", "Cherbourg" ].random();
}
var generateFakeComment = function () {
  return [
   "Merci!",
   "Je t'ai ajouté! :D",
   "Lol, c'te gros tocard.",
   "j'arrive pas à faire venir Roger à mon Open 13 et ça me fout les boules.",
   "C'est EXACTEMENT ça, Franchement pour dire ça faut vraiment être d'une mauvaise foi incomparable ou n'y rien connaître au tennis. On peut ne pas aimer Federer mais ne pas reconnaître qu'il fait le show...",
   "Sous entendu : Désolé de cette interview de merde. je dois vite me retirer et crever très vite. Ciao. ",
   "Haha on sent le mec frustré qui veut se démarquer de la masse en critiquant Federer alors que tout le monde l'adule. \
\
Ou alors c'est juste que pour lui, spectacle = faire le gorille et le clown sur le terrain... \
\
Et le \"s'il n'était pas numéro 3 on en parlerait pas autant\"   dans le genre \"j'ai aucun argument pour descendre Federer, donc j'en invente un bien débile\" \
\
Ah mais c'est sûr, si Federer n'avait pas gagné 17 GC, on n'en parlerait pas autant ! ",
   "C'était pas lui qui disait que la victoire de Federer à Bercy était sa plus belle édition parce qu'il était fan et tout et tout ?",
   "Ah ben comme ça on est fixé sur la venue de Federer à l'open 13 (bon y avait pas trop de suspens   ) ",
   "Enfin quelqu'un qui ose dire les vrais choses   \
Lui c'est un vrai connaisseur  ",
   "Jean-François Couillemolle.",
   "Il a fait le bon choix le Caujolle, je préfère qu'il nous achète Berdych, Delpo et Tipsarevic plutôt que l'autre mannequin pour montres. Cela aurait été clairement mieux qu'il se débarasse aussi de Tsonga et Gasquet qui génèrent vraiment trop de vacarme dans les gradins (pour les remplacer par des joueurs moins chers et moins bruyants comme par exemple Cilic, Nishikori, Haas), mais on ne peut pas trop lui en vouloir, c'est du bon boulot pour JF.",
   "Bah, vas-y, ramène Djokovic alors.  ",
   "Enfin quelqu'un qui ose le critiquer. \
    Bravo très bon article"
  ].random();
}
var generateFakeLocation = function () {
  // trying to generate longitude / latitude inside france :)
  return { long: 45 + Math.random() * 10, lat: Math.random() * 4 }
}
var generateFakeDateCreation = function () {
  // date entre il y a 2 et 3 h
  var secAgo = 3600 * 2 + Math.floor(Math.random() * 3600);
  return new Date(new Date().getTime() - secAgo * 1000).toISO();
}
var generateFakeDateEnd = function () {
  // date entre il y a 0 et 1 h
  var secAgo = Math.floor(Math.random() * 3600);
  return new Date(new Date().getTime() - secAgo * 1000).toISO();
}

DB.clubs = [
  /*
   * document club :
   * {
   *   id: string, // checksum hexa
   *   sport: string,
   *   name: string,
   *   city: string
   *   FIXME (address, telephone, nb joueurs, ...)
   * }
   */
];

DB.players = [ 
  /*
   * document player :
   * {
   *   id: string, // checksum hexa
   *   nickname: string,
   *   name: string,
   *   password: string, // checksum hexa
   *   rank: string,
   *   club: string, // id 
   *   games: [
   *      string, // id
   *      string, // id
   *      ...
   *   ]
   *   FIXME: (poid, taille, adresse, infos perso, ...)
   */
];

DB.games = [
  /*
   * document game:
   * {
   *   id: string, // checksum hexa
   *   date_creation: string, // date iso 8601
   *   date_start: string, // date iso 8601
   *   date_end: string, // date iso 8601
   *   owner,
   *   pos: { long: float, lat: float }, // index geospatial
   *   country: string,
   *   city: string,
   *   type: string, // singles / doubles
   *   sets: string, // ex: 6,2;6,3  (precomputed)
   *   status: string, // ongoing, canceled, finished (precomputed)
   *   teams: [
   *     { id: null, players: [ { id: string }, ... ] },
   *     { id: null, players: [ { name: string }, ... ] }
   *   ],
   *   stream: [
   *       FIXME: historique du match, action / date / heure / commentaire / video / photo etc
   *   ]
   */
];



var generateClubsAsync = function () {
  var names = ["CAEN TC", "CAEN LA BUTTE", "LOUVIGNY TC", "MONDEVILLE USO", "CONDE SUR NOIREAU TC", "ARROMANCHE TENNIS PORT WILSON", "FLEURY TENNIS CLUB"];
  var clubs = names.map(function (clubName) {
    return new DB.Model.Club({
      sport: "tennis",
      name: clubName,
      city: generateFakeCity()
    });
  });
  return DB.saveAsync(clubs);
};

var generatePlayersAsync = function () {
  // reading random club
  var nbPlayers = 20;
  var randomClubs = [];
  for (var i = 0; i < nbPlayers; ++i) {
     randomClubs.push(DB.getRandomModelAsync(DB.Model.Club));
  }
  return Q.all(randomClubs)
          .then(function (clubs) {
     var players = clubs.map(function (club) {
       try {
        return new DB.Model.Player({
            nickname: generateFakePseudo(),
            name: generateFakeFirstName() + " " + generateFakeName(),
            rank: "15/2",
            club: club.id,
            games: [],
            // generation only
            random : Math.random(),
            //
            password: null,
            token: String(Math.floor(Math.random()*10000000))
        });
       } catch (e) { console.log('erreur ' + e); }
     });
     return DB.saveAsync(players);
   });
};

var testPlayersAsync = function () {
  DB.Model.Player.findOne({}).exec(function (err, player) {
    player.games.push(player);
    player.save(function (err, player) {
      console.log(JSON.stringify(player.toObject({virtual:true})));
    });
  });
};

var generateGamesAsync = function () {
  // generating 20 games
  var deferred = Q.defer();
  
  DB.Model.Player.find({})
                 .exec(function (err, players) {
    if (err)
      return deferred.reject();
    // Youpi.
    var games = [];
    var nbGames = 20;
    
    for (var i = 0; i < nbGames; ++i) {
      var game = new DB.Model.Game({
        owner: players.random().id, // utilisateur ayant saisi le match.
        pos: generateFakeLocation(),
        country: "france",
        city: generateFakeCity(),
        type: "singles",
        sets: "",
        score: "",
        sport: "tennis",
        status: "unknown",
        teams: [ ],
        stream: [ ]
      });
      
      // random pick match status, finished ? or ongoing ?
      game.status = ["ongoing", "finished"].random();
      // 
      if (game.status === "finished") {
        // status finished
        game.date_end = generateFakeDateEnd();
        if (Math.random() > 0.5) {
          game.sets = "6/"+Math.floor(Math.random() * 5)+";6/"+Math.floor(Math.random() * 5);
          game.score = "2/0";
        } else {
          game.sets = Math.floor(Math.random() * 5)+"/6;"+Math.floor(Math.random() * 5)+"/6";
          game.score = "0/2";
        }
      } else {
        // status ongoing
        if (Math.random() > 0.5) {
          // 2 set
          if (Math.random() > 0.5) {
            game.sets = "6/"+Math.floor(Math.random() * 5)+";"+Math.floor(Math.random() * 5)+"/"+Math.floor(Math.random() * 5);
            game.score = "1/0";
          } else {
            game.sets = Math.floor(Math.random() * 5)+"/6;"+Math.floor(Math.random() * 5)+"/"+Math.floor(Math.random() * 5);
            game.score = "0/1";
          }
        } else {
          // 1 set
          game.sets = Math.floor(Math.random() * 5)+"/"+Math.floor(Math.random() * 5);
          game.score = "0/0";
        }
      }
      
      // generating players
      var player1 = players[(i*2)%20];
      var player2 = players[(i*2+1)%20];
      
      // sometimes, players are "anonymous"
      if (Math.random() < 0.2) {
        if (Math.random() < 0.3) {
          game.teams = [
            { id: null, players: [ { name: generateFakePseudo() } ] },
            { id: null, players: [ { name: generateFakePseudo() } ] } 
          ];
        } else {
          if (Math.random() < 0.5) {
            game.teams = [
              { id: null, players: [ { name: generateFakePseudo() } ] },
              { id: null, players: [ { id : player2.id } ] }
            ];
          } else {
            game.teams = [
              { id: null, players: [ { id: player1.id } ] },
              { id: null, players: [ { name: generateFakePseudo() } ] }
            ];
          }
        }
      } else {
        game.teams = [
          { id: null, players: [ { id: player1.id } ] },
          { id: null, players: [ { id: player2.id } ] }
        ];
      }
      
      // generating 0 to 10 comments
      var nbComments = Math.floor(Math.random() * 11);
      var delta = 0;
      for (var j = 0; j < nbComments; ++j) {
        // adding random (1 to 5) minutes
        delta += 1000 * 60 * (1 + Math.floor(Math.random(5)));
        var date = new Date(new Date(game.date_start).getTime() + delta);
        var comment = {
          type: "comment",
          owner: players.random().id,
          data: { text: generateFakeComment() }
        }
        game.stream.push(comment);
      }
      
      games.push(game);
    }

    DB.saveAsync(games).then(function (games) {
      games.forEach(function (game, i) {
        // adding games to players
        if (game.teams[0].players[0].id) {
          players[(i*2)%20].games.push(game.id);
        }
        if (game.teams[1].players[0].id) {
          players[(i*2+1)%20].games.push(game.id);
        }
      });
      
      // saving players
      DB.saveAsync(players).then(function () {
        deferred.resolve();
      }, function (e) { console.log('error ' + e); } );
    });
  });
  return deferred.promise;
};

DB.dropCollection = function (collectionName) {
  var deferred = Q.defer();
  if (Conf.env === "DEV") {
    if (DB.status === "connected") {
      mongoose.connection.collections[collectionName].drop( function(err) {
        if (err)
          deferred.reject("error dropping collection");
        deferred.resolve("collection dropped");
      });
    } else {
      deferred.reject("not connected");
    }
  }
  else {
    deferred.reject("drop collection only allowed on dev environment");
  }
  return deferred.promise;
};

DB.reset = function () {
  if (Conf.env === "DEV") {
    return Q.allResolved([
      DB.dropCollection("clubs"),
      DB.dropCollection("players"),
      DB.dropCollection("games")
    ]);
  }
  // FIXME: warning, should never be here 
  return Q.allResolved([]);
};

// generating fake data at startup (DEV ONLY)
mongoose.connection.once("open", function () {
  if (Conf.env === "DEV") {
    DB.reset().then(function () {
      DB.generateFakeData();
    });
  }
});

DB.generateFakeData = function () {
  generateClubsAsync()
   .then(generatePlayersAsync)
   .then(generateGamesAsync)
   .then(function () {
     console.log('FAKE DATA GENERATED');
   });
};

// undefined if nothing is found
DB.searchById = function (collection, id) {
   return collection.filter(function (o) { return o.id === id }).pop();
};

DB.isAuthenticatedAsync = function (query) {
  var deferred = Q.defer();
  if (query.playerid && query.token) {
    DB.Model.Player.findOne({_id: query.playerid, token: query.token})
                   .exec(function (err, player) {
                      if (err)
                        deferred.reject(err);
                      else
                        deferred.resolve(player);
                   });
  } else {
    deferred.resolve(null); // no player.
  }
  return deferred.promise;
};

DB.generateFakeId = generateFakeId;
DB.generateFakeName = generateFakeName;

module.exports = DB;