var mongoose = require('mongoose')
  , Schema = mongoose.Schema
  , Conf = require('./conf.js')
  , Q = require('q')
  , app = require('./app.js')
  , crypto = require('crypto')
  , curry = require('curry')
  , Authentication = require('./authentication.js');
  
var ObjectId = mongoose.Types.ObjectId;

var DB = {
  status : 'disconnected',
};

// custom JSON api
JSON.stringifyModels = function (m, options) {
  options = options || {};
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

DB.toStringId = function (o) {
  if (typeof o === "string")
    return o;
  if (typeof o === "object" && o instanceof ObjectId)
    return String(o);
  if (typeof o === "object" && o && o.id) // null is an object
    return DB.toStringId(o.id);
  if (typeof o === "object" && o && o._id) // null is an object
    return DB.toStringId(o._id);
  return null;
};

DB.toObjectId = function (o) {
  var stringId = DB.toStringId(o);
  if (stringId)
    return new ObjectId(stringId);
  return null;
};

DB.Id = {
  eq : function (idA, idB) { return DB.toStringId(idA) === DB.toStringId(idB) },
  neq: function (idA, idB) { return DB.toStringId(idA) !== DB.toStringId(idB) }
};

// global db helpers

/*
  * Saving one or multiple documents
  *
  * ex:
  *   var playerA = new DB.Models.Player({ "name" : "vincent" });
  *   var playerB = new DB.Models.Player({ "name" : "marc" });
  *   DB.save(playerA).then(...)
  *   DB.save([playerA, playerB]).then(...)
  */
DB.save = function (docs) {
  if (Array.isArray(docs))
    return Q.all(docs.map(DB.save));
  return Q.ninvoke(docs, 'save')
          .spread(function (r) { return r });
};

// @param model DB.Models.*
// @param ids  ["id",..] or [{id:..}] or {id:} or "id"
// @return Promise(true/false)
DB.existOrEmpty = curry(function (model, ids) {
  if (!ids || (Array.isArray(ids) && ids.length === 0))
    return Q(true);
  return DB.exist(model, ids);
});

// @param model DB.Models.*
// @param ids  ["id",..] or [{id:..}] or {id:} or "id"
// @return Promise(true/false)
DB.exist = curry(function (model, ids) {
  ids = (Array.isArray(ids)) ? ids : [ ids ];
  ids = ids.map(DB.toStringId).unique();
  return Q.nfcall(model.count.bind(model), { _id: { $in: ids }})
          .then(function (r) { return r === ids.length });
});

// @param model   DB.Models.*
// @param unused  just here to enable currying
// @return Promise(model)
DB.getRandomModel = function (model) {
  return Q.nfcall(model.count.bind(model), {})
          .then(function (n) {
            var randomIndex = Math.floor(Math.random() * n);
            var query = model.find({}).skip(randomIndex).limit(1);
            return Q.nfcall(query.exec.bind(query))
                     .then(function (r) { return (r.length) ? r[0] : null });
          });
};

DB.findById = curry(function (model, id) {
  return Q.nfcall(model.findById.bind(model), id);
});

//
// FIXME: ce chargement est bof (arbre de dépendance resolu manuellement)
//  peut être faudrait il intégrer https://github.com/jrburke/amdefine
//

// mongoose data
DB.Definitions = require('./db/definitions.js');
DB.Schemas = require('./db/schemas.js');
DB.Models = require('./db/models.js')

// generating schemas
DB.Schemas.generate(DB);
// generating models
DB.Models.generate(DB);

Authentication.init(DB);

module.exports = DB;
