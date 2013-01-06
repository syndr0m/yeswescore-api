define(['jquery', 'underscore', 'backbone', 'models/Player'],
function($, _, Backbone,Player){

  var Players = Backbone.Collection.extend({
  
  	mode:'default',
  	query:'',
	  
    url:function() {
    	
     console.log('mode de Players',this.mode); 	
     
     if (this.mode === 'club')
        return serviceURLPlayers+'?club='+this.query;
     else if (this.mode === 'search')
        return serviceURLPlayers+'autocomplete/?q='+this.query;        
      else	
      	return serviceURLPlayers;
    },
    
	model:Player, 
	
	//FIXME 
	//localStorage: new Backbone.LocalStorage("players"), 
	
	initialize: function () {
		this.changeSort("name");
		
	},
	
	follow: function(follow) {
		/* FIXME : 1 objet */
		if (window.localStorage.getItem("PlayersFollow")!==null )
		{
			//on cree la pile
			var pile = new Players({url:JSON.parse(window.localStorage.getItem("PlayersFollow"))});				
			pile.add(follow) ;				
			window.localStorage.setItem("PlayersFollow",JSON.stringify(pile));
		}
		//Ajoute le premier element
		else 
			window.localStorage.setItem("PlayersFollow",JSON.stringify(follow));
	},
	
	getFollows: function() {
	
		return JSON.parse(window.localStorage.getItem("PlayersFollow"));
		
	
	},	
	
	setMode:function(m,q) {
    	this.mode=m;
    	this.query=q;
    },
	
    sync: function(method, model, options) {
        var params = _.extend({
            type: 'GET',
            dataType: 'json',
            url: model.url(),
            processData:false
        }, options);

	

        return $.ajax(params);
    },
    
    /*
    comparator: function(item) {
    	//POSSIBLE MULTI FILTER [a,b,..]
        return [item.get("city")];
      },
    */
    
    comparator: function (property) {
    	return selectedStrategy.apply(Game.get(property));
    },
    
    strategies: {
        name: function (item) { return [item.get("name")]; }, 
        nickname: function (item) { return [item.get("nickname")]; },
        rank: function (item) { return [item.get("rank")]; }        
    },
    
    changeSort: function (sortProperty) {
        this.comparator = this.strategies[sortProperty];
    }

  });
  
  return new Players();
});
