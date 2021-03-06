//This module handles most stuff associated with the map-gui. It HAS to be a singleton!
define(["require", "state", "jquery", "conf", "oscar", "flickr", "tools", "tree", "bootstrap", "leaflet", "leafletCluster", "awesomeMarkers", "dag", "dagexp", "leafletBing"],
function (require, state, $, config, oscar, flickr, tools, tree) {
	var L = require("leaflet");
	var dag = require("dag");
	var dagexp = require("dagexp");
	var leafletBing = require("leafletBing");

	//handles a single item list
	//parent is the parent element of the Item list the handler should take care of
	//It adds a panel div with class panel-group as parent for the list
	//This triggers itemDetailsOpened and itemDetailsClosed with the respective itemId on the parent element
	var ItemListHandler = function(parent, scrollContainer) {
		if (scrollContainer === undefined) {
			scrollContainer = parent;
		}
		parent = $(parent);
		scrollContainer = $(scrollContainer);
		var handler = {
			m_domRoot : undefined,
			m_scrollContainer: scrollContainer,
			m_inFlightItems: tools.SimpleSet(),
			m_itemIds: tools.SimpleSet(),
			m_eventHandlers : {
				itemIdQuery: function(e) {
					var me = $(this);
					var myItemId = me.attr('data-item-id');
					if (myItemId === undefined) {
						return false;
					}
					var myQstr = "$item:" + myItemId;
					state.addSingleQueryStatementToQuery(myQstr);
					return false;
				},
				itemDetailQuery: function(e) {
					var me = $(this);
					var myKey = me.attr('data-query-key');
					if (myKey === undefined) {
						return false;
					}
					var myQstr = "@" + myKey;
					var myValue = me.attr('data-query-value');
					if (myValue !== undefined) {
						myQstr += ":" + myValue;
					}
					state.addSingleQueryStatementToQuery(myQstr);
					return false;
				},
				itemLinkClicked: function(e) {
					var me = $(this);
					var itemIdStr = me.attr("data-item-id");
					var itemId = parseInt(itemIdStr);
					handler._slot_itemLinkClicked(itemId);
				},
				itemPanelMouseOver: function(e) {
					var me = $(this);
					var itemIdStr = me.parent().attr("data-item-id");
					var itemId = parseInt(itemIdStr);
					handler.emit_itemPanelMouseOver(itemId);
				},
				itemPanelMouseOut: function(e) {
					var me = $(this);
					var itemIdStr = me.parent().attr("data-item-id");
					var itemId = parseInt(itemIdStr);
					handler.emit_itemPanelMouseOut(itemId);
				}
			},
			//signals emited on the root dom-element
	   
			emit_itemDetailsOpened: function(itemId) {
				$(handler).triggerHandler({type:"itemDetailsOpened", itemId : itemId});
			},
			emit_itemDetailsClosed: function(itemId) {
				$(handler).triggerHandler({type:"itemDetailsClosed", itemId : itemId});
			},
			emit_itemLinkClicked: function(itemId) {
				$(handler).triggerHandler({type:"itemLinkClicked", itemId : itemId});
			},
			emit_itemPanelMouseOver: function(itemId) {
				$(handler).triggerHandler({type:"itemPanelMouseOver", itemId : itemId});
			},
			emit_itemPanelMouseOut: function(itemId) {
				$(handler).triggerHandler({type:"itemPanelMouseOut", itemId : itemId});
			},
			//private functions
	   
			_init: function(parent) {
				var myId = tools.generateDocumentUniqueId();
				var myMarkup = '<div class="panel-group" id="' + myId + '"></div>';
				$(parent).append(myMarkup);
				handler.m_domRoot = $("#" + myId);
			},
	   
			_addEventHandlers: function(elements) {
				//this function takes for 1k elements
				//170 ms with elements=m_domRoot or elements empty
				//800 ms with elements set to the array of inserted elements
				//1k elements -> 235 ms. Make sure that handlers are only attached once!
				var keyC = $(".item-detail-key", elements);
				var valC = $(".item-detail-value", elements);
				var detC = $(".item-detail-id", elements);
				var actC = $(".accordion-toggle-link", elements);
				var panelh = $(".panel-heading", elements);
				
				var myClickNS = "click.ilhevh";
				var myMouseOverNS = "mouseover.ilhevh";
				var myMouseOutNS = "mouseout.ilhevh";
				keyC.unbind(myClickNS).bind(myClickNS, handler.m_eventHandlers.itemDetailQuery);
				valC.unbind(myClickNS).bind(myClickNS, handler.m_eventHandlers.itemDetailQuery);
				detC.unbind(myClickNS).bind(myClickNS, handler.m_eventHandlers.itemIdQuery);
				actC.unbind(myClickNS).bind(myClickNS, handler.m_eventHandlers.itemLinkClicked);
				panelh.unbind(myMouseOverNS).bind(myMouseOverNS, handler.m_eventHandlers.itemPanelMouseOver);
				panelh.unbind(myMouseOutNS).bind(myMouseOutNS, handler.m_eventHandlers.itemPanelMouseOut);
			},
			_item2RenderData: function(item) {
				return state.resultListTemplateDataFromItem(item);
			},
			_renderItems: function(items) {
				var itemData = [];
				for(let item of items) {
					itemData.push(handler._item2RenderData(item));
				}
				var rendered = $.Mustache.render('arrayItemListEntryHtmlTemplate', {wrappedarray: itemData});
				return rendered;
			},
			_renderItem: function(item) {
				return handler._renderItems([item]);
			},
			//returns jquery object of the inserted dom item element, by default appends
			_insertRendered: function(rendered) {
				return $($(rendered).appendTo(this.m_domRoot));
			},
			//returns jquery object of the inserted dom item element
			_insertItem: function(item) {
				var rendered = handler._renderItem(item);
				var inserted = handler._insertRendered(rendered);
				handler._addEventHandlers(inserted);
				return inserted;
			},
			_domItemRoot: function(itemId) {
				return $("div[class~='panel'][data-item-id~='" + itemId + "']", handler.m_domRoot);
			},
			_domItemHeader: function(itemId) {
				return $("div[class~='panel'][data-item-id~='" + itemId + "'] div[class~='panel-heading']", handler.m_domRoot);
			},
			_domItemDetails: function(itemId) {
				return $("div[class~='panel'][data-item-id~='" + itemId + "'] div[class~='panel-collapse'][data-item-id~='"+ itemId +"']", handler.m_domRoot);
			},
			
			//internal slots
			_slot_itemLinkClicked: function(itemId) {
				handler.emit_itemLinkClicked(itemId);
				handler.toggle(itemId);
			},

			//public functions
	   
			domRoot: function() {
				return handler.m_domRoot;
			},
	   
			//use this to iterate over itemIds
			itemIds: function() {
				return handler.m_itemIds;
			},
	   
			size: function() {
				return handler.m_itemIds.size();
			},
	   
			//calls cb for each handled itemId
			each: function(cb) {
				handler.m_itemIds.each(cb);
			},
			
			active: function(cb) {
				each(function(itemId) {
					if (handler._domItemDetails(itemId).hasClass("in")) {
						cb(itemId);
					}
				});
			},
	   
			hasItem: function(itemId) {
				return handler.m_itemIds.count(itemId);
			},
	   
			count: function(itemId) {
				return handler.hasItem(itemId);
			},
	   
			open: function(itemId) {
				var details = handler._domItemDetails(itemId);
				details.each(function() {
					var me = $(this);
					if (me.hasClass("collapse") ) {
						me.removeClass("collapse");
						me.addClass("in");
						handler.emit_itemDetailsOpened(itemId);
					}
				});
			},
			//
			close: function(itemId) {
				var details = handler._domItemDetails(itemId);
				details.each(function() {
					var me = $(this);
					if (me.hasClass("in")) {
						me.removeClass("in");
						me.addClass("collapse");
						handler.emit_itemDetailsClosed(itemId);
					}
				});
			},
			//toggle collapse-state of an item
			toggle: function(itemId) {
				var details = handler._domItemDetails(itemId);
				details.each(function() {
					var me = $(this);
					if (me.hasClass("collapse")) {
						me.removeClass("collapse");
						me.addClass("in");
						handler.emit_itemDetailsOpened(itemId);
					}
					else {
						me.removeClass("in");
						me.addClass("collapse");
						handler.emit_itemDetailsClosed(itemId);
					}
				});
			},
			scrollTo: function(itemId) {
				if (!handler.hasItem(itemId)) {
					return;
				}
				var itemPanelRootDiv = handler._domItemRoot(itemId);
				var scrollPos = itemPanelRootDiv.offset().top - handler.m_scrollContainer.offset().top + handler.m_scrollContainer.scrollTop();
				handler.m_scrollContainer.animate({scrollTop: scrollPos-5});
				//container.animate({scrollTop: itemPanelRootDiv.position().top + $("itemsList").position().top});
			},
			//a multi purpous insert function, cb is called after insertion
			insert: function(data, cb) {
				if (typeof data === "string" || typeof data === "number") {
					handler.insertItemId(data, cb);
				}
				else if (data instanceof Array) {
					if (!data.length) {
						return;
					}
					if (typeof data[0] === "string" || typeof data[0] === "number") {
						handler.insertItemIds(data, cb);
					}
					else {
						handler.insertItems(data, cb);
					}
				}
				else {
					handler.insertItem(item, cb);
				}
			},
			insertItemIds: function(itemIds, cb) {
				var needItemIds = [];
				for(let itemId of itemIds) {
					if (!handler.count(itemId) && !handler.m_inFlightItems.count(itemId)) {
						needItemIds.push(itemId);
					}
				}
				handler.m_inFlightItems.insertArray(needItemIds);
				oscar.getItems(needItemIds, function(items) {
					var needItems = [];
					for(let item of items) {
						if (handler.m_inFlightItems.count(item.id())) {
							needItems.push(item);
						}
					}
					if (needItems.length) {
						handler.insertItems(needItems, cb);
					}
					for (let itemId of needItemIds) {
						handler.m_inFlightItems.erase(itemId);
					}
				}, tools.defErrorCB);
			},
			insertItemId: function(itemId, cb) {
				if (handler.count(itemId)) {
					return;
				}
				handler.m_inFlightItems.insert(itemId);
				oscar.getItem(itemId, function(item) {
					if (handler.m_inFlightItems.count(item.id())) {
						handler.insertItem(item, cb);
					}
					handler.m_inFlightItems.erase(itemId);
				}, tools.defErrorCB);
			},
			insertItem: function(item, cb) {
				if (!handler.hasItem(item.id())) {
					handler._insertItem(item);
					handler.m_itemIds.insert(item.id());
				}
				if (cb !== undefined) {
					cb();
				}
			},
			//return number of inserted items
			insertItems: function(items, cb) {
				var missingItems = [];
				for(let item of items) {
					var itemId = item.id();
					if (!handler.hasItem(itemId)) {
						missingItems.push(item);
						handler.m_itemIds.insert(itemId);
					}
				}
				var toInsert = handler._renderItems(missingItems);
				var inserted = handler._insertRendered(toInsert);
				handler._addEventHandlers(inserted);

				if (cb !== undefined) {
					cb();
				}
				
				return missingItems.length;
			},
			remove: function(itemId) {
				if (handler.m_inFlightItems.count(itemId)) {
					handler.m_inFlightItems.erase(itemId);
					return;
				}
				else if (handler.count(itemId)) {
					handler.close(itemId);
					handler._domItemRoot(itemId).each(function() {
						$(this).remove();
					});
					handler.m_itemIds.erase(itemId);
				}
			},
			//returns number of added+removed items
			assign: function(items) {
				var itemIdSet = tools.SimpleSet();
				for(let item of items) {
					itemIdSet.insert(item.id());
				}
				var itemsToRemove = [];
				handler.each(function(itemId) {
					if (! itemIdSet.count(itemId) ) {
						itemsToRemove.push(itemId);
					}
				});
				for(let itemId of itemsToRemove) {
					handler.remove(itemId);
				}
				return handler.insertItems(items) + itemsToRemove.length;
			},
			//emits itemDetailsClosed on all open panels   
			clear: function() {
				$("div[class~='panel'] div[class~='panel-collapse']", handler.m_domRoot).each(function() {
					var me = $(this);
					var itemIdStr = me.attr("data-item-id");
					var itemId = parseInt(itemIdStr);
					if (me.hasClass("in")) {
						me.removeClass("in");
						me.addClass("collapse");
						handler.emit_itemDetailsClosed(itemId);
					}
				});
				$(handler.m_domRoot).empty();
				handler.m_itemIds.clear();
				handler.m_inFlightItems.clear();
			},
			
			//destroy this list by removing the respective dom elements
			//emits itemDetailsClosed on all open panels
			destroy : function() {
				handler.clear();
				$(handler.m_domRoot).remove();
			}
		};
		handler._init(parent);
		return handler;
	};
	
	var InspectionItemListHandler = function(parent, scrollContainer) {
		var ilh = ItemListHandler(parent, scrollContainer);
		ilh._item2RenderData = function(item) {
			return state.resultListTemplateDataFromItem(item, true, true);
		};
		
		ilh._insertRendered = function(rendered) {
			return $($(rendered).prependTo(this.m_domRoot));
		};
		
		//Remove link clicked handling
		ilh.m_eventHandlers["itemRemoveLinkClicked"] = function(e) {
			var me = $(this);
			var itemIdStr = me.attr("data-item-id");
			var itemId = parseInt(itemIdStr);
			ilh._slot_itemRemoveLinkClicked(itemId);
		};
		ilh["_slot_itemRemoveLinkClicked"] = function(itemId) {
			ilh.close(itemId);
			ilh.emit_itemRemoveLinkClicked(itemId);
			ilh.remove(itemId);
		};
		ilh["emit_itemRemoveLinkClicked"] = function(itemId) {
			$(ilh).triggerHandler({type:"itemRemoveLinkClicked", itemId : itemId});
		};
		
		//pin link clicked handling
		ilh.m_eventHandlers["itemPinLinkClicked"] = function(e) {
			var me = $(this);
			var itemIdStr = me.attr("data-item-id");
			var itemId = parseInt(itemIdStr);
			ilh._slot_itemPinLinkClicked(itemId);
		};
		ilh["_slot_itemPinLinkClicked"] = function(itemId) {
			ilh.emit_itemPinLinkClicked(itemId);
			if (ilh.isPinned(itemId)) {
				ilh.unpin(itemId);
				$(".fa-thumb-tack", ilh._domItemHeader(itemId)).removeClass("fa-rotate-90");
			}
			else {
				ilh.pin(itemId);
				$("i.fa-thumb-tack", ilh._domItemHeader(itemId)).addClass("fa-rotate-90");
			}
		};
		ilh["emit_itemPinLinkClicked"] = function(itemId) {
			$(ilh).triggerHandler({type:"itemPinLinkClicked", itemId : itemId});
		};

		//title link clicked handling
		ilh.m_eventHandlers["itemTitleLinkClicked"] = function(e) {
			var me = $(this);
			var itemIdStr = me.attr("data-item-id");
			var itemId = parseInt(itemIdStr);
			ilh._slot_itemTitleLinkClicked(itemId);
		};
		ilh["_slot_itemTitleLinkClicked"] = function(itemId) {
			ilh.emit_itemTitleLinkClicked(itemId);
		};
		ilh["emit_itemTitleLinkClicked"] = function(itemId) {
			$(ilh).triggerHandler({type:"itemTitleLinkClicked", itemId : itemId});
		};

		ilh["_o_ItemListHandler_addEventHandlers"] = ilh._addEventHandlers;
		ilh._addEventHandlers = function(elements) {
			ilh._o_ItemListHandler_addEventHandlers(elements);
			var aclC = $(".accordion-remove-link", elements);
			var aplC = $(".accordion-pin-link", elements);
			var atlC = $(".accordion-title-link", elements);
			
			var myClickNS = "click.iilhevh";
			aclC.unbind(myClickNS).bind(myClickNS, ilh.m_eventHandlers.itemRemoveLinkClicked);
			aplC.unbind(myClickNS).bind(myClickNS, ilh.m_eventHandlers.itemPinLinkClicked);
			atlC.unbind(myClickNS).bind(myClickNS, ilh.m_eventHandlers.itemTitleLinkClicked);
		};
		ilh["_o_ItemListHandler_clear"] = ilh.clear;
		ilh["clear"] = function() {
			for(let itemId of ilh.itemIds().builtinset()) {
				ilh.emit_itemRemoveLinkClicked(itemId);
			}
			ilh["_o_ItemListHandler_clear"]();
		};
		ilh["m_pinned"] = tools.SimpleSet();
		ilh["pinned"] = function() {
			return ilh.m_pinned;
		};
		ilh["isPinned"] = function(itemId) {
			return ilh.m_pinned.count(itemId);
		};
		ilh["pin"] = function(itemId) {
			if (ilh.count(itemId)) {
				ilh.m_pinned.insert(itemId);
			}
		}
		ilh["unpin"] = function(itemId) {
			ilh.m_pinned.erase(itemId);
		}
		ilh["removeUnpinned"] = function(itemId) {
			if (ilh.m_pinned.size()) {
				var toRemove = [];
				
				ilh.m_inFlightItems.clear();
				
				for(let itemId of ilh.itemIds().builtinset()) {
					if (!ilh.m_pinned.count(itemId)) {
						toRemove.push(itemId);
					}
				}
				
				for(let itemId of toRemove) {
					ilh.emit_itemRemoveLinkClicked(itemId);
					ilh.remove(itemId);
				}
			}
			else {
				ilh.clear();
			}
		}
		
		return ilh;
	};

	var RelativesItemListHandler = function(parent, scrollContainer) {
		var ilh = ItemListHandler(parent, scrollContainer);
		ilh._item2RenderData = function(item) {
			return state.resultListTemplateDataFromItem(item, false, true);
		};
		return ilh;
	}
	
	//handles multiple item lists as tab groups
	//*emits multiple signals on it self
	//cfg : {
	//   parent: <parent container>,
	//   scrollContainer: <scroll container>,
	//   paginationContainer: <pagination container>,
	//   itemsPerPage: <int>
	//   topk: function(k, offset, cellIds, cb) // a function to retrieve the top-k elements of cells beginning at offset
	//}
	var ItemListTabHandler = function(config) {
		if (config.scrollContainer === undefined) {
			config.scrollContainer = config.parent;
		}
		config.parent = $(config.parent);
		config.scrollContainer = $(config.scrollContainer);
		config.paginationContainer = $(config.paginationContainer);
		var handler = {
			config: config,
			m_domRoot : undefined,
			m_domTabRoot : undefined,
			m_domPaginationRoot: undefined,
			//maps from tabId=<int> ->
			//{ handler : ItemListHandler,
			//  tabContentId: <string>,
			//  tabHeadId: <string>,
			//  cells: tools.SimpleSet(),
			//  offset: <int>
			//  count: <int>
			//}
			m_tabs : tools.SimpleHash(), 
			_createTabData : function(ilh, tabContentId, tabHeadId, cells, offset, count) {
				return {
					handler : ilh,
					tabContentId: tabContentId,
					tabHeadId: tabHeadId,
					cells: cells,
					offset: offset,
					count: count
				};
			},
			//signals
			emit_itemDetailsOpened: function(itemId) {
				$(handler).triggerHandler({type:"itemDetailsOpened", itemId : itemId});
			},
			emit_itemDetailsClosed: function(itemId) {
				$(handler).triggerHandler({type:"itemDetailsClosed", itemId : itemId});
			},
			emit_itemLinkClicked: function(itemId) {
				$(handler).triggerHandler({type:"itemLinkClicked", itemId : itemId});
			},
			emit_itemPanelMouseOver: function(itemId) {
				$(handler).triggerHandler({type:"itemPanelMouseOver", itemId : itemId});
			},
			emit_itemPanelMouseOut: function(itemId) {
				$(handler).triggerHandler({type:"itemPanelMouseOut", itemId : itemId});
			},
	   
			//if no tab is active, then rid=-1
			emit_activeTabChanged: function(newTabId) {
				$(handler).triggerHandler({
					type: "activeTabChanged",
					newTabId: newTabId,
					tid: newTabId
				});
			},
			
			_slot_activeTabChanged: function() {
				handler._updatePagination();
				handler.emit_activeTabChanged(handler.activeTabId());
			},
	   
			_slot_pageLinkClicked: function(e) {
				var me = $(this);
				var offset = parseInt( me.attr("data-offset") );
				var tabId = handler.activeTabId();
				if (tabId !== -1) {
					handler._setTabResultListOffset(tabId, offset);
				}
			},
			_topk: function(k, offset, cellIds, cb) {
				handler.config.topk(k, offset, cellIds, cb);
			},
			_init: function (parent) {
				var myDomRootId = tools.generateDocumentUniqueId();
				var myDomTabRootId = tools.generateDocumentUniqueId();
				var myDomRootHtml = '<div id="' + myDomRootId + '"></div>';
				var myDomTabRootHtml = '<ul id="' + myDomTabRootId + '"></ul>';
				$(parent).append(myDomRootHtml);
				handler.m_domRoot = $("#" + myDomRootId);
				handler.m_domRoot.append(myDomTabRootHtml);
				handler.m_domTabRoot = $("#" + myDomTabRootId);
				handler.m_domRoot.tabs();
				//register events
				handler.m_domRoot.on("tabsactivate", function(event, ui) {
					handler._slot_activeTabChanged();
				});
				handler.m_domPaginationRoot = $($('<ul class="pagination hidden"></ul>').appendTo(handler.config.paginationContainer));
			},
			_insertItem: function(tabId, item) {
				if (handler.m_tabs.count(tabId)) {
					handler.m_tabs.at(tabId).handler.insertItem(item);
				}
			},
			_insertItems: function(tabId, items) {
				if (handler.m_tabs.count(tabId)) {
					handler.m_tabs.at(tabId).handler.insertItems(items);
				}
			},
			_assignItems: function(tabId, items) {
				if (handler.m_tabs.count(tabId)) {
					var changed = handler.m_tabs.at(tabId).handler.assign(items);
					if (changed && handler.activeTabId() == tabId) {
						handler.emit_activeTabChanged();
					}
				}
			},
			_updatePagination: function() {
				var activeTabId = handler.activeTabId();
				if (activeTabId === -1) {
					handler.m_domPaginationRoot.addClass("hidden");
					handler.m_domPaginationRoot.empty();
					return;
				}
				else {
					handler.m_domPaginationRoot.removeClass("hidden");
				}
				var tabData = handler.m_tabs.at(activeTabId);
				var pages = [{offset: 0, begin: 0, end: Math.min(tabData.offset+tabData.count, handler.config.itemsPerPage)-1}];
				
				if (tabData.offset > 0) {
					
					//the one before our current page
					if (tabData.offset > handler.config.itemsPerPage) {
						if (tabData.offset > 2*handler.config.itemsPerPage) {
							pages.push({
								offset: tabData.offset-handler.config.itemsPerPage,
								end: tabData.offset-1
							});
						}
						else {
							pages.push({
								offset: tabData.offset-handler.config.itemsPerPage,
								begin: tabData.offset-handler.config.itemsPerPage,
								end: tabData.offset-1
							});
						}
					}
					
					pages.push({
						offset: tabData.offset,
						begin: tabData.offset,
						end: tabData.offset+tabData.count-1
					});
				}
				
				//the one after our current (but only if this is not the last)
				if (tabData.count >= handler.config.itemsPerPage) {
					pages.push({
						offset: tabData.offset+tabData.count,
						begin: tabData.offset+tabData.count
					});
				}
				
				for (let i = 0; i < pages.length; ++i) {
					if (pages[i].begin === tabData.offset) {
						pages[i]["active"] = true;
					}
				}
				var rendered = $.Mustache.render('resultListPaginationTemplate', {pages: pages});
				handler.m_domPaginationRoot.empty();
				var inserted = $($(rendered).appendTo(handler.m_domPaginationRoot));
				$("a", inserted).click(handler._slot_pageLinkClicked);
			},
	   
			_setTabResultListOffset: function(tabId, offset, cb, force=false) {
				offset = (offset/handler.config.itemsPerPage)*handler.config.itemsPerPage;
				if (offset === handler.m_tabs.at(tabId).offset && !force) {
					return;
				}
				
				var cells = handler.cells(tabId);
				handler._topk(handler.config.itemsPerPage, offset, cells.toArray(), function(itemIds) {
					//this should return instantly since the items are in the cache
					var myCB = cb;
					var myTabId = tabId;
					oscar.getItems(itemIds, function(items) {
						console.assert(items.length <= itemIds.length);
						if (!handler.count(myTabId) || !cells.equal(handler.cells(myTabId))) {
							return;
						}
						var tabData = handler.m_tabs.at(myTabId);
						tabData.offset = offset;
						tabData.count = items.length;
						handler._assignItems(myTabId, items);
						if (handler.activeTabId() === myTabId) {
							handler._slot_activeTabChanged();
						}
						if (myCB !== undefined) {
							myCB();
						}
					});
				});
			},

			setMaxItemsPerPage: function(num) {
				handler.config.itemsPerPage = num;
				let aId = handler.activeTabId();
				if (aId !== -1) {
					let off = handler.m_tabs.at(aId).offset;
					handler._updatePagination();
					handler._setTabResultListOffset(aId, off, undefined, true);
				}
			},
	   
			//Do not use this except for iterating over all available tabs
			tabIds: function() {
				return handler.m_tabs.builtinmap().keys();
			},
	   
			cells: function(tabId) {
				return handler.m_tabs.at(tabId).cells;
			},
			
			///cells must be of type tools.SimpleSet()
			setCells: function(tabId, cells, cb) {
				if (handler.hasTab(tabId)) {
					//check if cells changed, if not, ignore update
					if (!cells.equal(handler.m_tabs.at(tabId).cells)) {
						var tabData = handler.m_tabs.at(tabId);
						tabData.cells = cells;
						tabData.offset = undefined;
						handler._setTabResultListOffset(tabId, 0, cb);
						console.log("Setting cells for tabId=" + tabId, cells.toArray());
					}
				}
			},
	   
			size: function() {
				return handler.m_tabs.size();
			},
			
			domRoot: function() {
				return handler.m_domRoot;
			},
			hasTab: function(tabId) {
				return handler.m_tabs.count(tabId);
			},
			count: function(tabId) {
				return handler.hasTab(tabId);
			},
			itemListHandler: function(tabId) {
				return handler.m_tabs.at(tabId).handler;
			},
			
			//adds a new tab, returns an ItemListHandler, if prepend == true, then the tab will be added as the first element
			addTab: function(tabId, tabName, itemCount, prepend, itemListHandlerCreator) {
				if (handler.m_tabs.count(tabId)) {
					return handler.m_tabs.at(tabId).handler;
				}
				
				if (prepend === undefined) {
					prepend = false;
				}
				if (itemListHandlerCreator === undefined) {
					itemListHandlerCreator = ItemListHandler;
				}
				
				//add a new tab
				var tabHeadId = tools.generateDocumentUniqueId();
				var tabContentId = tools.generateDocumentUniqueId();
				var tabItemCount = "";
				if (itemCount !== undefined && itemCount >= 0) {
					tabItemCount = '&nbsp;<span class="badge">' + itemCount + '</span>';
				}
				var tabHeadHtml = '<li id="' + tabHeadId + '" tabid="' + tabId + '">'
									+ '<a href="#' + tabContentId + '">' + tabName
									+ tabItemCount
									+ '</a></li>';
				var tabContentHtml = '<div id="' + tabContentId + '"></div>';
				if (prepend) {
					$(handler.m_domTabRoot).prepend(tabHeadHtml);
				}
				else {
					$(handler.m_domTabRoot).append(tabHeadHtml);
				}
				$(handler.m_domRoot).append(tabContentHtml);
				var tabContent = $('#' + tabContentId, handler.m_domRoot);
				var itemListHandler = itemListHandlerCreator(tabContent, handler.m_scrollContainer);
				var tabData = handler._createTabData(itemListHandler, tabHeadId, tabContentId, tools.SimpleSet(), 0, itemCount);
				handler.m_tabs.insert(tabId, tabData);
				//take care of the signals emited from the list handler
				$(itemListHandler).on("itemDetailsOpened", function(e) { handler.emit_itemDetailsOpened(e.itemId); });
				$(itemListHandler).on("itemDetailsClosed", function(e) { handler.emit_itemDetailsClosed(e.itemId); });
				$(itemListHandler).on("itemLinkClicked", function(e) { handler.emit_itemLinkClicked(e.itemId); });
				$(itemListHandler).on("itemPanelMouseOver", function(e) { handler.emit_itemPanelMouseOver(e.itemId); });
				$(itemListHandler).on("itemPanelMouseOut", function(e) { handler.emit_itemPanelMouseOut(e.itemId); });
				
				var myActiveTabId = handler.activeTabId();
				handler.refresh();
				if (myActiveTabId !== -1) {
					handler.openTab(myActiveTabId);
				}
				return handler.m_tabs.at(tabId).handler;
			},
			//removes a tab return true, if removal was successfull
			removeTab: function(tabId) {
				if (handler.m_tabs.count(tabId)) {
					var myActiveTabId = handler.activeTabId();
					var v = handler.m_tabs.at(tabId);
					v.handler.destroy();
					$("#" + v.tabHeadId ).remove();
					$("#" + v.tabContentId ).remove();
					handler.m_tabs.erase(tabId);
					handler.refresh();
					if (tabId !== myActiveTabId && myActiveTabId !== -1) {
						handler.openTab(myActiveTabId);
					}
					//check if this was the last tab we have,
					//since then there will be no new active tab
					if (!handler.size()) {
						handler._updatePagination();
						handler.emit_activeTabChanged(-1);
					}
					return true;
				}
				return false;
			},
			
			openTab: function(tabId) {
				if (!handler.hasTab(tabId)) {
					return;
				}
				var index = $("#" + handler.m_tabs.at(tabId).tabHeadId).index();
				handler.m_domRoot.tabs("option", "active", index);
			},
				
			activateTab: function(tabId) {
				if (handler.activeTabId() === tabId) {
					handler.emit_activeTabChanged(tabId);
				}
				else {
					handler.openTab(tabId);
				}
			},
			
			openItem: function(itemId) {
				if (!handler.size()) {
					return;
				}
				if (handler.activeTab().hasItem(itemId)) {
					handler.activeTab().open(itemId);
				}
				else {
					for(let tabId of handler.tabIds()) {
						if (handler.m_tabs.at(tabId).handler.hasItem(itemId)) {
							handler.openTab(tabId);
							handler.m_tabs.at(tabId).handler.open(itemId);
							break;
						}
					}
				}
			},
	   
			activeTabId: function() {
				if (!handler.m_tabs.size()) {
					return -1;
				}
				var index = handler.m_domRoot.tabs("option", "active");
				var li = handler.m_domTabRoot.children().eq(index);
				var tabIdStr = li.attr("tabid");
				var tabId = parseInt(tabIdStr);
				return tabId;
			},
	   
			//return handler of the active tab
			activeTab: function() {
				var tabId = handler.activeTabId();
				if (parseInt(tabId) >= 0) {
					return handler.m_tabs.at(tabId).handler;
				}
				return undefined;
			},
			
			refresh: function () {
				handler.m_domRoot.tabs("refresh");
				handler.m_domRoot.tabs("option", "active", 0);
			},

			clear: function() {
				if (!handler.size()) {
					return;
				}
				for(let tabId of handler.tabIds()) {
					var info = handler.m_tabs.at(tabId);
					info.handler.destroy();
					$('#' + info.tabContentId).remove();
					$('#' + info.tabHeadId).remove();
				}
				handler.m_tabs.clear();
				handler.refresh();
				handler._slot_activeTabChanged(-1);
			},

			destroy: function () {
				handler.clear();
				handler.m_domRoot.tabs("destroy");
				handler.m_domRoot.destroy();
				handler.m_domRoot = undefined;
			}
		};
		handler._init(config.parent);
		return handler;
	};
	
	//base class for Leaflet layers which take care of layers of items
	//It triggers event on itself
	//Derived classes need to provide a function _fetchLayer(itemId, call-back)
	var ItemLayerHandler = function(target, map) {
		if (map === undefined) {
			map = target;
		}
		this.m_target = target;
		this.m_map = map;
		this.m_layers = tools.SimpleHash(); //maps from id -> {layer: LeafletLayer, refCount: <int> }
		this.m_forwardedSignals = {}, //add the name of the signals you want to process here in the form ["layer signal name", "map signal name"]
		this._handleEvent = function(e, itemId) {
			var targetSignals = this.m_forwardedSignals[e.type];
			if (targetSignals === undefined) {
				return;
			}
			for(var i in targetSignals) {
				var myE = $.Event(targetSignals[i]);
				myE.itemId = itemId;
				$(this).triggerHandler(myE);
			}
		};
		this._addSignalHandlers = function(layer, itemId) {
			var me = this;
			for(var i in this.m_forwardedSignals) {
				layer.on(i, function(e) {
					me._handleEvent(e, itemId);
				});
			}
		};
		this.target = function() {
			return this.m_target;
		},
		//this only affects layers added AFTER! calling this function
		this.addSignalForward = function(sourceSignalName, mappedSignalName) {
			if (this.m_forwardedSignals[sourceSignalName] !== undefined) {
				if ($.inArray(mappedSignalName, this.m_forwardedSignals[sourceSignalName])) {
					return;
				}
			}
			else {
				this.m_forwardedSignals[sourceSignalName] = [];
			}
			this.m_forwardedSignals[sourceSignalName].push(mappedSignalName);
		},
		this.size = function() {
			return this.m_layers.size();
		};
		this.count = function(itemId) {
			if (this.m_layers.count(itemId)) {
				return this.m_layers.at(itemId).refCount;
			}
			return 0;
		};
		this.incRefCount = function(itemId) {
			if (!this.m_layers.count(itemId)) {
				this.m_layers.insert(itemId, {layer: undefined, refCount : 0});
			}
			this.m_layers.at(itemId).refCount += 1;
		};
		this.setLayer = function(itemId, layer) {
			if (!this.m_layers.count(itemId)) {
				this.incRefCount(itemId);
			}
			if (this.m_layers.at(itemId).layer !== undefined) {
				this.m_target.removeLayer(this.m_layers.at(itemId).layer);
				this.m_layers.at(itemId).layer = undefined;
			}
			if (layer !== undefined) {
				this.m_layers.at(itemId).layer = layer;
				this.m_target.addLayer(this.m_layers.at(itemId).layer);
			}
		};
		this.insert = function(itemId, extraArguments) {
			this.add(itemId, extraArguments);
		};
		this.add = function(itemId, extraArguments) {
			this.addWithCallback(itemId, undefined, extraArguments);
		};
		//todo remove this in favor of ... syntax
		///calls cb after adding this to the map
		this.addWithCallback = function(itemId, cb, extraArguments) {
			if (this.count(itemId)) {
				this.incRefCount(itemId);
				return;
			}
			this.incRefCount(itemId);
			var me = this;
			//call super class
			var mycb = function(layer) {
				if (me.count(itemId) && me.layer(itemId) === undefined) {
					layer.itemId = itemId;
					me._addSignalHandlers(layer, itemId);
					me.setLayer(itemId, layer);
					if (cb !== undefined) {
						cb();
					}
				};
			};
			if (extraArguments !== undefined) {
				this._fetchLayer(mycb, itemId, extraArguments);
			}
			else {
				this._fetchLayer(mycb, itemId);
			}
		},
		this.remove = function(itemId) {
			if (this.count(itemId)) {
				this.m_layers.at(itemId).refCount -= 1;
				if (this.m_layers.at(itemId).refCount <= 0) {
					if (this.m_layers.at(itemId).layer !== undefined) {
						this.m_target.removeLayer(this.m_layers.at(itemId).layer);
					}
					this.m_layers.erase(itemId);
				}
			}
		};
		this.layer = function(itemId) {
			if (this.count(itemId)) {
				return this.m_layers.at(itemId).layer;
			}
			return undefined;
		};
		this.layers = function() {
			return this.m_layers;
		};
		this.layerIds = function() {
			return this.m_layers.builtinmap().keys();
		};
		this.zoomTo = function(itemId) {
			if (!this.count(itemId)) {
				return;
			}
			var ll = this.layer(itemId);
			this.m_map.fitBounds(ll.getBounds());
		};
		this.clear = function() {
			for(let layerId of this.layerIds()) {
				if (this.m_layers.at(layerId).layer !== undefined) {
					this.m_target.removeLayer(this.m_layers.at(layerId).layer);
				}
			}
			this.m_layers = tools.SimpleHash();
		};
		this.destroy = function() {
			this.clear();
		};
		this.setTarget = function(target) {
			console.assert(!this.m_layers.size());
			this.m_target = target;
		};
	};
	
	//The ShapeHandler handles the map shapes. It uses ref-counting to track the usage of shapes
	//Style is of the form:
	var ItemShapeHandler = function(target, style, map) {
		var handler = new ItemLayerHandler(target, map);
		handler.m_style = style;
		handler.m_forwardedSignals = {"click": ["click"]};
		//calls cb after adding if cb !== undefined
		handler._fetchLayer = function(cb, itemId) {
			var me = this;
			oscar.getShape(itemId, function(shape) {
				var lfs = oscar.leafletItemFromShape(shape);
				lfs.setStyle(me.m_style);
				cb(lfs);
			}, tools.defErrorCB);
		};
		return handler;
	};
	
	var ChoroplethShapeHandler = function(target, style, map) {
		var handler = new ItemLayerHandler(target, map);
		handler.m_style = style;
		handler.m_colorParams = {
			maxCount: 0xFFFFFFFF,
			totalCount: 0,
			totalArea: 0,
			stdByArea: true
		},
		handler.m_forwardedSignals = {"click": ["click"]};
		//calls cb after adding if cb !== undefined
		handler._fetchLayer = function(cb, itemId) {
			var me = this;
			var applyStyle = function(lfs) {
				let itemStyle = me.m_style; //base
				itemStyle.color = me._color(itemId); //it's ok if area is null
				lfs.setStyle(me.m_style);
			};
			
			if (state.dag.hasRegion(itemId) && state.dag.region(itemId).chMapShape !== undefined) {
				let chMapShape = state.dag.region(itemId).chMapShape;
				applyStyle(chMapShape);
				cb(chMapShape);
			}
			else {
				oscar.getShape(itemId, function(shape) {
					if (!state.dag.hasRegion(itemId)) {
						return;
					}
					let lfs = oscar.leafletItemFromShape(shape);
					if (config.map.clusterShapes.choropleth.display && !state.dag.region(itemId).area) {
						state.dag.region(itemId).area = handler.geodesicArea(lfs.getLatLngs());
					}
					applyStyle(lfs);
					state.dag.region(itemId).chMapShape = lfs;
					cb(lfs);
				}, tools.defErrorCB);
			}
		};
		handler.setMaxCount = function(v) {
			this.m_colorParams.maxCount = v;
		};
		handler.setTotalCount = function(v) {
			this.m_colorParams.totalCount = v;
		};
		handler.setTotalAreaFromViewPort = function() {
			let b = state.map.getBounds();
			let poly = [b.getSouthWest(), b.getNorthWest(), b.getNorthEast(), b.getSouthEast()];
			this.m_colorParams.totalArea = handler.geodesicArea( poly );
		};
		handler.setTotalArea = function(v) {
			this.m_colorParams.totalArea = v;
		};
		handler.setStandardizeByArea = function(v) {
			this.m_colorParams.stdByArea = v;
		};
		handler.recomputeColors = function() {
			for(let x of this.layerIds()) {
				if (this.layer(x) !== undefined) {
					this.layer(x).setStyle({"color": this._color(x)});
				}
			}
		};
		handler._color = function(itemId) {
			return config.map.clusterShapes.choropleth.color[config.map.clusterShapes.choropleth.type](state.dag.region(itemId).count, state.dag.region(itemId).area, handler.m_colorParams)
		};
		//Copied from Leaflet.Draw
		handler.geodesicArea = function (latLngs) {
			var calc = function(latLngs) {
				let pointsCount = latLngs.length,
					area = 0.0,
					d2r = Math.PI / 180,
					p1, p2;

				if (pointsCount > 2) {
					for (let i = 0; i < pointsCount; i++) {
						p1 = latLngs[i];
						p2 = latLngs[(i + 1) % pointsCount];
						area += ((p2.lng - p1.lng) * d2r) *
							(2 + Math.sin(p1.lat * d2r) + Math.sin(p2.lat * d2r));
					}
					area = area * 6378137.0 * 6378137.0 / 2.0;
				}
				return Math.abs(area);
			};
			
			if (Array.isArray(latLngs) && latLngs.length && Array.isArray(latLngs[0])) {
				let totalLength = 0;
				for(let i=0; i < latLngs.length; ++i) {
					totalLength += calc(latLngs[i]);
				}
				return totalLength;
			}
			else {
				return calc(latLngs);
			}

		};
		return handler;
	};
	
	var MarkerHandler = function(target, map) {
		var handler = new ItemLayerHandler(target, map);
		///returns leaflet LatLng
		handler.coords = function(itemId) {
			if (!this.count(itemId)) {
				throw new RangeError();
			}
			var l = this.layer(itemId);
			return l.getLatLng();
		};
		handler.zoomTo = function(itemId) {
			if (!this.count(itemId)) {
				return;
			}
			this.m_map.panTo(handler.coords(itemId));
		};
		handler["icon_options"] = {
			icon: "circle",
			prefix : 'fa',
			markerColor: config.styles.markers.color.standard
		};
		handler["marker_options"] = {};
		
		return handler;
	};

	var ItemMarkerHandler = function(target, map) {
		var handler = MarkerHandler(target, map);
		handler.m_forwardedSignals = {"click": ["click"]};
		handler._fetchLayer = function(cb, itemId) {
			oscar.getItem(itemId, function(item) {
				oscar.getShape(itemId, function(shape) {
					if (shape.t === oscar.ShapeTypes.MultiPolygon) {
						geopos = shape.v.outer[0][0];
					}
					else if (shape.t === oscar.ShapeTypes.Polygon) {
						geopos = shape.v[0];
					}
					else if (shape.t === oscar.ShapeTypes.Way) {
						geopos = shape.v[0];
					}
					else {
						geopos = shape.v;
					}
					var icon = undefined;
					for(var i=0, s=item.size(); i < s; ++i) {
						var key = item.key(i)
						if (config.styles.markers.icons[key] !== undefined) {
							var value = item.value(i);
							if (config.styles.markers.icons[key][value] !== undefined) {
								var opts = Object.assign({}, handler.icon_options);
								opts["icon"] = config.styles.markers.icons[key][value];
								opts["prefix"] = 'fa';
								icon = L.AwesomeMarkers.icon(opts);
								break;
							}
						}
					}
					var myMarkerOpts = Object.assign({}, handler.marker_options);
					if (icon === undefined) {
						myMarkerOpts["icon"] = L.AwesomeMarkers.icon(handler.icon_options);
						
					}
					else {
						myMarkerOpts["icon"] = icon;
					}
					var marker = L.marker(geopos, myMarkerOpts);
					marker.bindPopup(item.name());
					marker.on("mouseover", function() {
						marker.openPopup();
					});
					marker.on("mouseout", function() {
						marker.closePopup();
					});
					cb( marker );
				}, tools.defErrorCB);
			});
		};
		return handler;
	};
	
	var RegionMarkerHandler = function(target, map) {
		var handler = MarkerHandler(target, map);
		handler.m_forwardedSignals = {"click" : ["click"], "mouseover": ["mouseover"], "mouseout": ["mouseout"]};
		handler._fetchLayer = function(cb, itemId, count) {
			console.assert(count !== undefined, count);
			oscar.getItem(itemId, function(item) {
				var markerPos;
				if (state.dag.hasRegion(itemId) && state.dag.region(itemId).clusterHint !== undefined) {
					markerPos = state.dag.region(itemId).clusterHint;
				}
				else {
					markerPos = item.centerPoint();
				}
				var marker = L.marker(markerPos);
				marker.name = item.name();
				marker.bbox = item.bbox();
				marker.count = count;
				//needed by prototype.js and cluster-marker.js
				marker.rid = itemId;
				cb(marker);
			}, tools.defErrorCB);
		};
		return handler;
	};
	
	var SpatialQueryGeoObjectHandler = function() {
		var handler = MarkerHandler();
		handler.m_forwardedSignals = {"click": ["click"]};
		handler._fetchLayer = function(itemId, cb) {
			//fetched by internal id
			cb( state.spatialObjects.store.at(itemId).mapshape );
		};
		return handler;
	};
	
	L.MarkerCluster.prototype["getChildClustersNames"] = function () {
		var names = [];
		var allChildClusters = this.getAllChildMarkers();

		for (let child of allChildClusters) {
			if (child.name != undefined) {
				names.push(child.name);
			}
		}
		return names;
	};

	L.MarkerCluster.prototype["getChildClustersRegionIds"] = function () {
		var rids = [];
		var allChildClusters = this.getAllChildMarkers();

		for (let child of allChildClusters) {
			if (child.rid !== undefined) {
				rids.push(child.rid);
			}
		}
		return rids;
	};

	var WORLD_TAB_ID = 0xFFFFFFFF;
	var INSPECTION_TAB_ID = WORLD_TAB_ID-1;
	
    var map = {
		ItemListHandler: ItemListHandler,
		InspectionItemListHandler: InspectionItemListHandler,
		RelativesItemListHandler: RelativesItemListHandler,
		ItemListTabHandler: ItemListTabHandler,
		ItemShapeHandler: ItemShapeHandler,
		ChoroplethShapeHandler: ChoroplethShapeHandler,
		ItemMarkerHandler: ItemMarkerHandler,
		RegionMarkerHandler: RegionMarkerHandler,

		resultListTabs: undefined,
		inspectionItemListHandler: undefined,
		relativesTab: { activeItemHandler: undefined, relativesHandler: undefined },
		
		//map shapes
		itemShapes: undefined,
		relativesShapes: undefined,
		highlightItemShapes: undefined,
		inspectedItemShapes: undefined,
		clusterMarkerRegionShapes: undefined,
		choroplethMapShapes: undefined,
		
		//markers
		itemMarkers: undefined,
		highlightItemMarkers: undefined,
		inspectionItemMarkers: undefined,
		clusterMarkerGroup: undefined,
		clusterMarkers: undefined,
		
		//dag handling
		dagExpander: dagexp.dagExpander(),
		
		//cfg
		cfg: config.map,
		
		locks: {
			mapViewChanged: {locked: false, queued: false}
		},
		
		//this has to be called prior usage
		init: function() {
			map.resultListTabs = map.ItemListTabHandler({
				parent: '#result_list_container',
				scrollContainer: '#sidebar-content',
				paginationContainer: '#result_list_pagination',
				itemsPerPage: map.cfg.resultList.itemsPerPage,
				topk: map.topKItems
			});
			map.inspectionItemListHandler = map.InspectionItemListHandler('#inspectItemsList', '#sidebar-content');
			map.relativesTab.activeItemHandler = map.RelativesItemListHandler($('#activeItemsList'));
			map.relativesTab.relativesHandler = map.RelativesItemListHandler($('#relativesList'));
			
			//init the map layers
			map.itemShapes = map.ItemShapeHandler(L.layerGroup().addTo(state.map), config.styles.shapes.items.normal, state.map);
			map.inspectedItemShapes = map.ItemShapeHandler(L.layerGroup().addTo(state.map), config.styles.shapes.items.inspected, state.map);
			map.relativesShapes = map.ItemShapeHandler(L.layerGroup().addTo(state.map), config.styles.shapes.relatives.normal, state.map);
			map.highlightItemShapes = map.ItemShapeHandler(L.layerGroup().addTo(state.map), config.styles.shapes.activeItems, state.map);
			map.clusterMarkerRegionShapes = map.ItemShapeHandler(L.layerGroup().addTo(state.map), config.styles.shapes.regions.highlight, state.map);
			map.choroplethMapShapes = map.ChoroplethShapeHandler(L.layerGroup().addTo(state.map), config.styles.shapes.regions.choropleth, state.map);
			
			map.itemMarkers = map.ItemMarkerHandler( L.layerGroup().addTo(state.map), state.map);
			
			map.highlightItemMarkers = map.ItemMarkerHandler( L.layerGroup().addTo(state.map), state.map);
			map.highlightItemMarkers.icon_options.markerColor = config.styles.markers.color.highlighted;
			map.highlightItemMarkers.marker_options["zIndexOffset"] = 2000;
			
			map.inspectionItemMarkers = map.ItemMarkerHandler( L.layerGroup().addTo(state.map), state.map);
			map.inspectionItemMarkers.icon_options.markerColor = config.styles.markers.color.inspected;
			map.inspectionItemMarkers.marker_options["zIndexOffset"] = 1000;

			//init the cluster markers
            map.clusterMarkerGroup = L.markerClusterGroup(config.map.clustering.clusterMarkerOptions);
			state.map.addLayer(map.clusterMarkerGroup);
			map.clusterMarkers = map.RegionMarkerHandler(map.clusterMarkerGroup);
			
			$("#inspect-remove-all").on("click", map.onInspectRemoveAllClicked);
		},

	   _attachEventHandlers: function() {
			$(map.resultListTabs).on("itemLinkClicked", map.onItemLinkClicked);
			$(map.resultListTabs).on("itemDetailsOpened", map.onItemDetailsOpened);
			$(map.resultListTabs).on("itemDetailsClosed", map.onItemDetailsClosed);
			$(map.resultListTabs).on("itemPanelMouseOver", map.onItemPanelMouseOver);
			$(map.resultListTabs).on("itemPanelMouseOut", map.onItemPanelMouseOut);
			$(map.resultListTabs).on("activeTabChanged", map.onActiveTabChanged);

			$(map.inspectionItemListHandler).on("itemLinkClicked", map.onInspectItemLinkClicked);
			$(map.inspectionItemListHandler).on("itemDetailsOpened", map.onInspectItemDetailsOpened);
			$(map.inspectionItemListHandler).on("itemDetailsClosed", map.onInspectItemDetailsClosed);
			$(map.inspectionItemListHandler).on("itemRemoveLinkClicked", map.onInspectItemRemoveLinkClicked);
			$(map.inspectionItemListHandler).on("itemTitleLinkClicked", map.onInspectItemTitleLinkClicked);
			
			$(map.itemMarkers).on("click", map.onItemMarkerClicked);
			$(map.inspectionItemMarkers).on("click", map.onInspectionItemMarkerClicked);
			
			$(map.clusterMarkers).on("click", map.onClusterMarkerClicked);
			$(map.clusterMarkers).on("mouseover", map.onClusterMarkerMouseOver);
			$(map.clusterMarkers).on("mouseout", map.onClusterMarkerMouseOut);
			map.clusterMarkerGroup.on("clusterclick", map.onClusteredClusterMarkerClicked);
			map.clusterMarkerGroup.on("clustermouseover", map.onClusteredClusterMarkerMouseOver);
			map.clusterMarkerGroup.on("clustermouseout", map.onClusteredClusterMarkerMouseOut);
			map.clusterMarkerGroup.on("layerremove", map.onClusterMarkerLayerRemoved);
			
			state.map.on("click", map.onMapClicked);
		},
	   
		_detachEventHandlers: function() {
			$(map.resultListTabs).off("itemLinkClicked", map.onItemLinkClicked);
			$(map.resultListTabs).off("itemDetailsOpened", map.onItemDetailsOpened);
			$(map.resultListTabs).off("itemDetailsClosed", map.onItemDetailsClosed);
			$(map.resultListTabs).off("itemPanelMouseOver", map.onItemPanelMouseOver);
			$(map.resultListTabs).off("itemPanelMouseOut", map.onItemPanelMouseOut);
			$(map.resultListTabs).off("activeTabChanged", map.onActiveTabChanged);
			
			$(map.inspectionItemListHandler).off("itemLinkClicked", map.onInspectItemLinkClicked);
			$(map.inspectionItemListHandler).off("itemDetailsOpened", map.onInspectItemDetailsOpened);
			$(map.inspectionItemListHandler).off("itemDetailsClosed", map.onInspectItemDetailsClosed);
			$(map.inspectionItemListHandler).off("itemRemoveLinkClicked", map.onInspectItemRemoveLinkClicked);
			$(map.inspectionItemListHandler).off("itemTitleLinkClicked", map.onInspectItemTitleLinkClicked);
			
			$(map.itemMarkers).off("click", map.onItemMarkerClicked);
			$(map.inspectionItemMarkers).off("click", map.onInspectionItemMarkerClicked);
			
			$(map.clusterMarkers).off("click", map.onClusterMarkerClicked);
			$(map.clusterMarkers).off("mouseover", map.onClusterMarkerMouseOver);
			$(map.clusterMarkers).off("mouseout", map.onClusterMarkerMouseOut);
			map.clusterMarkerGroup.off("clusterclick", map.onClusteredClusterMarkerClicked);
			map.clusterMarkerGroup.off("clustermouseover", map.onClusteredClusterMarkerMouseOver);
			map.clusterMarkerGroup.off("clustermouseout", map.onClusteredClusterMarkerMouseOut);
			map.clusterMarkerGroup.off("layerremove", map.onClusterMarkerLayerRemoved);
			
			state.map.off("click", map.onMapClicked);
		},
		
		clear: function() {
			state.map.off("zoomend dragend", map.viewChanged);
			map._detachEventHandlers();
			
			state.dag.clear();

			map.itemShapes.clear();
			map.relativesShapes.clear();
			map.highlightItemShapes.clear();
			map.inspectedItemShapes.clear();
			map.clusterMarkerRegionShapes.clear();
			map.choroplethMapShapes.clear();
			
			map.itemMarkers.clear();
			map.highlightItemMarkers.clear();
			map.inspectionItemMarkers.clear();
			map.clusterMarkers.clear();

			map.resultListTabs.clear();
			map.inspectionItemListHandler.clear();
			map.relativesTab.activeItemHandler.clear();
			map.relativesTab.relativesHandler.clear();
			
			map._attachEventHandlers();
		},
	   
		//call this after changing options regarding shape handling
		reloadShapeConfig: function() {
			if (map.cfg.clusterShapes.auto) {
				if (state.cqr.rootRegionChildrenInfo().length > map.cfg.clusterShapes.threshold) {
					map.cfg.clusterShapes.preload = false;
					map.cfg.clusterShapes.display = false;
					map.cfg.clusterShapes.choropleth.display = false;
				}
				else {
					map.cfg.clusterShapes.preload = true;
					map.cfg.clusterShapes.display = true;
					if (map.cfg.clusterShapes.preload && map.cfg.clusterShapes.choropleth.type != "disabled") {
						map.cfg.clusterShapes.choropleth.display = true;
					}
					else {
						map.cfg.clusterShapes.choropleth.display = false;
					}
				}
			}
			map.dagExpander.setPreloadShapes(map.cfg.clusterShapes.preload);
			map.dagExpander.setBulkItemFetchCount(map.cfg.resultList.bulkItemFetchCount);
		},
		
		reloadClusterMarkerConfig: function() {
			map._assignClusterMarkers(tools.SimpleSet());

			state.map.removeLayer(map.clusterMarkerGroup);
			map.clusterMarkerGroup = L.markerClusterGroup(config.map.clustering.clusterMarkerOptions);
			state.map.addLayer(map.clusterMarkerGroup);
			map.clusterMarkers.setTarget(map.clusterMarkerGroup);
			
			map._detachEventHandlers();
			map._attachEventHandlers();
			
			map.mapViewChanged();
	   },

	   setMaxItemsPerPage: function(num) {
			map.cfg.resultList.itemsPerPage = num;
			map.resultListTabs.setMaxItemsPerPage(num);
	   },
		
		displayCqr: function (cqr) {
			map.clear();
			if (!cqr.hasResults()) {
				$("#result_list_container").addClass("hidden");
				$("#empty_result_info").removeClass("hidden");
				return;
			}
			else {
				$("#empty_result_info").addClass("hidden");
				$("#result_list_container").removeClass("hidden");
			}
			
			map.reloadShapeConfig();
			state.dag.addRoot(0xFFFFFFFF);
			var root = state.dag.region(0xFFFFFFFF);
			root.count = cqr.rootRegionApxItemCount();
			root.name = "World";
			
			//depending on the count, either start clustering or display all results
			
			if (root.count >= map.cfg.clustering.threshold) {
				map.startClustering();
			}
			else {
				map.displayAllItems();
			}
		},
	   
		//spatial query object handling
	   
		toggleSpatialObjectMapShape: function(internalId) {
			if (state.spatialObjects.store.count(internalId)) {
				var d = state.spatialObjects.store.at(internalId);
				var active = d['active'];
				if (active === undefined || active === false) {
					state.map.addLayer(d.mapshape);
					d['active'] = true;
				}
				else {
					state.map.removeLayer(d.mapshape);
					d['active'] = false;
				}
			}
		},
		removeSpatialObject: function(internalId) {
			if (state.spatialObjects.store.count(internalId)) {
				var d = state.spatialObjects.store.at(internalId);
				if (d.active === true) {
					state.map.removeLayer(d.mapshape);
				}
				state.spatialObjects.names.erase(d.name);
				state.spatialObjects.store.erase(internalId);
			}
		},
		appendSpatialObjectToTable : function(name) {
			var internalId = state.spatialObjects.names.at(name);
			if (internalId === undefined) {
				return;
			}
			var so = state.spatialObjects.store.at(internalId);
			var data = {
				type : so.type,
				id : internalId,
				name : name
			};
			var parentElement = $('#spatial_objects_table_body');
            var templateData = state.spatialQueryTableRowTemplateDataFromSpatialObject(data);
            var rendered = $.Mustache.render('spatialQueryTableRowTemplate', templateData);
            var inserted = $($(rendered).appendTo(parentElement));
			$(".checkbox", inserted).change(function() {
				map.toggleSpatialObjectMapShape(internalId);
			});
			$(".form-control", inserted).change(function() {
				var me = $(this);
				var d = state.spatialObjects.store.at(internalId);
				var oldName = d.name;
				d.name = me.val();
				state.spatialObjects.names.erase(oldName);
				state.spatialObjects.names.insert(d.name, internalId);
			});
			$(".fa-remove", inserted).click(function() {
				inserted.remove();
				map.removeSpatialObject(internalId);
			});
		},
		
		//relatives handling

		//shows the relatives of the currently active item if the relatives pane is active
		showItemRelatives: function() {
			if (!$('#sidebar-pane-relatives').hasClass("active") || state.items.activeItem === undefined) {
				return;
			}
			map.relativesTab.activeItemHandler.clear();
			map.relativesTab.relativesHandler.clear();
			var itemId = state.items.activeItem;
			oscar.getItem(itemId, function(item) {
				if (itemId != state.items.activeItem) {
					return;
				}
				map.relativesTab.activeItemHandler.insertItem(item);
			});
			oscar.getItemsRelativesIds(itemId, function(relativesIds) {
				if (state.items.activeItem != itemId) {
					return;
				}
				var myItemId = itemId;
				oscar.getItems(relativesIds, function(relatives) {
					if (state.items.activeItem != myItemId) {
						return;
					}
					map.relativesTab.relativesHandler.insertItems(relatives);
				}, tools.defErrorCB);
			}, tools.defErrorCB);
		},
		

		removeUnpinnedInspectionItems: function() {
			map.inspectionItemListHandler.removeUnpinned();
			if (!map.inspectionItemListHandler.size() && state.sidebar.isOpen("inspect")) {
				state.sidebar.open("search");
			}
		},
	   
		addToInspection: function(itemId) {
			var focusItem = function() {
				if (itemId == state.items.inspectItem) {
					state.sidebar.open("inspect");
					map.inspectionItemListHandler.scrollTo(itemId);
					map.inspectionItemListHandler.open(itemId);
				}
			};
			state.items.inspectItem = itemId;
			if (map.inspectionItemListHandler.count(itemId)) {
				focusItem();
			}
			else {
				map.inspectionItemListHandler.insertItemId(itemId, focusItem);
				if (map.cfg.resultList.showItemMarkers) {
					map.inspectionItemMarkers.addWithCallback(itemId, function() {
						if (itemId == state.items.inspectItem) {
							map.inspectionItemMarkers.zoomTo(itemId);
						}
					});
				}
			}
		},
		
		removeFromInspection: function(itemId) {
			map.inspectionItemListHandler.remove(itemId);
			map.inspectionItemMarkers.remove(itemId);
			if (!map.inspectionItemListHandler.size() && state.sidebar.isOpen("inspect")) {
				state.sidebar.open("search");
			}
		},
	   
		onInspectionItemMarkerClicked: function(e) {
			if ($('#sidebar-pane-relatives').hasClass("active")) {
				state.items.activeItem = e.itemId;
				map.showItemRelatives();
			}
			else {
				if (state.items.inspectItem == e.itemId) {
					state.items.inspectItem = -1;
				}
				map.removeFromInspection(e.itemId);
			}
		},
		
		onInspectRemoveAllClicked: function() {
			map.inspectionItemListHandler.clear();
			if (!map.inspectionItemListHandler.size()) {
				state.sidebar.open("search");
			}
		},
	   
		onInspectItemLinkClicked: function(e) {
			var itemId = e.itemId;
			state.items.inspectItem = itemId;
		},
		
		onInspectItemRemoveLinkClicked: function(e) {
			map.removeFromInspection(e.itemId);
		},
	   
		onInspectItemTitleLinkClicked: function(e) {
			if (map.inspectionItemMarkers.count(e.itemId)) {
				map.inspectionItemMarkers.zoomTo(e.itemId);
			}
		},
		
		onInspectItemDetailsOpened: function(e) {
			var itemId = e.itemId;
			map.inspectedItemShapes.addWithCallback(itemId, function() {
				if (state.items.inspectItem == itemId) {
					map.highlightItemShapes.zoomTo(itemId);
				}
			});
		},
		
		onInspectItemDetailsClosed: function(e) {
			var itemId = e.itemId;
			if (state.items.inspectItem === itemId) {
				state.items.inspectItem = -1;
			}
			map.inspectedItemShapes.remove(itemId);
		},
	   
		onItemLinkClicked: function(e) {
			var itemId = e.itemId;
			state.items.activeItem = itemId;
			map.addToInspection(itemId);
		},
		
		//panel event handlers
		onItemDetailsOpened: function(e) {
			var itemId = e.itemId;
			map.highlightItemShapes.addWithCallback(itemId, function() {
				if (state.items.activeItem == itemId) {
					map.highlightItemShapes.zoomTo(itemId);
				}
			});
			if (map.itemMarkers.count(itemId)) {
				var geopos = map.itemMarkers.coords(itemId);
				var text = "";
				if (oscar.itemCache.count(itemId)) {
					text = oscar.itemCache.at(itemId).name();
				}
				
				L.popup({offset: new L.Point(0, -25)})
					.setLatLng(geopos)
					.setContent(text).openOn(state.map);

				if ($('#show_flickr').is(':checked')) {
					flickr.getImagesForLocation($.trim(text), geopos);
				}
			}
		},
		onItemDetailsClosed: function(e) {
			var itemId = e.itemId;
			if (state.items.activeItem === itemId) {
				state.items.activeItem = -1;
			}
			map.highlightItemShapes.remove(itemId);
			flickr.closeFlickrBar();
		},
		
		onItemPanelMouseOver: function(e) {
			map.highlightItemMarkers.insert(e.itemId);
		},
	   
		onItemPanelMouseOut: function(e) {
			map.highlightItemMarkers.remove(e.itemId);
		},
		
		
		onMapClicked: function(e) {
			map.removeUnpinnedInspectionItems();
		},
		
		//removes old item markers and adds the new ones (if needed)
		//Note: there may be no active region present!
		onActiveTabChanged: function(e) {
			var wantItemMarkers;
			if (map.resultListTabs.activeTabId() >= 0 && map.cfg.resultList.showItemMarkers) {
				wantItemMarkers = map.resultListTabs.activeTab().itemIds();
			}
			else {
				wantItemMarkers = tools.SimpleSet();
			}
			var removedIds = tools.SimpleSet();
			var missingIds = tools.SimpleSet();
			tools.getMissing(wantItemMarkers, map.itemMarkers.layers(), removedIds, missingIds);
			removedIds.each(function(itemId) {
				map.itemMarkers.remove(itemId);
				state.dag.item(itemId).displayState &= ~dag.DisplayStates.HasItemMarker;
			});
			if (missingIds.size()) {
				oscar.fetchShapes(missingIds.toArray(), function() {}, tools.defErrorCB);
			}
			missingIds.each(function(itemId) {
				map.itemMarkers.add(itemId);
			});
			//mark dag nodes accordingly
			for(let itemId of map.itemMarkers.layerIds()) {
				state.dag.item(itemId).displayState |= dag.DisplayStates.HasItemMarker;
			}
			
			if (map.resultListTabs.size() && map.cfg.resultList.showItemShapes) {
				var removedIds = tools.SimpleSet();
				var missingIds = tools.SimpleSet();
				tools.getMissing(wantItemMarkers, map.itemShapes.layers(), removedIds, missingIds);
				removedIds.each(function(itemId) {
					map.itemShapes.remove(itemId);
				});
				if (missingIds.size()) {
					oscar.fetchShapes(missingIds.toArray(), function() {}, tools.defErrorCB);
				}
				missingIds.each(function(itemId) {
					map.itemShapes.add(itemId);
				});
			}
			else {
				map.itemShapes.clear();
			}
			
		},
		
		onItemMarkerClicked: function(e) {
			state.items.activeItem = e.itemId;
			map.resultListTabs.openItem(e.itemId);
			map.resultListTabs.activeTab().scrollTo(e.itemId);
			if ($('#sidebar-pane-relatives').hasClass("active")) {
				map.showItemRelatives();
			}
			else {
				map.addToInspection(e.itemId);
			}
			
		},
		onClusterMarkerLayerRemoved: function(e) {
			map.closePopups();
			map.clusterMarkerRegionShapes.remove(e.layer.itemId);
			map.choroplethMapShapes.remove(e.layer.itemId);
		},
		onClusterMarkerClicked: function(e) {
			map.closePopups();
			map.clusterMarkers.remove(e.itemId);
			map.zoomTo(e.itemId);
			if (!state.dag.region(e.itemId).isLeaf) {
				map.expandRegion(e.itemId, function() {
					map.mapViewChanged();
				});
			}
		},
		onClusterMarkerMouseOver: function(e) {
			if (map.cfg.clusterShapes.display) {
				map.clusterMarkerRegionShapes.add(e.itemId);
			}
			var coords = map.clusterMarkers.coords(e.itemId);
			var marker = map.clusterMarkers.layer(e.itemId);
			L.popup({offset: new L.Point(0, -10)})
				.setLatLng(coords)
				.setContent(e.itemId + ":" + marker.name).openOn(state.map);
		},
		onClusteredClusterMarkerClicked: function (e) {
			e.layer.zoomToBounds();
		},
		onClusterMarkerMouseOut: function(e) {
			map.closePopups();
			map.clusterMarkerRegionShapes.clear();
		},
		onClusteredClusterMarkerMouseOut: function(e) {
			map.closePopups();
			map.clusterMarkerRegionShapes.clear();
		},
		onClusteredClusterMarkerMouseOver: function(e) {
			var target = e.layer;
			if (target.getChildCount() > 1 && target.getChildCount() <= config.maxNumSubClusters && map.cfg.clusterShapes.display) {
				var childRids = target.getChildClustersRegionIds();
				oscar.fetchShapes(childRids, function() {}, tools.defErrorCB);
				for(let childRid of childRids) {
					map.clusterMarkerRegionShapes.add(childRid);
				}
			}
			var names = target.getChildClustersNames();
			var text = "";
			if (names.length > 0) {
				let i = 0;
				text += names[i];
				for(i=1, s=Math.min(config.maxNumSubClusters, names.length); i < s; ++i) {
					text += ", " + names[i];
				}
				if (names.length > config.maxNumSubClusters && i == config.maxNumSubClusters) {
					text += "...";
				}
				L.popup({offset: new L.Point(0, -10)}).setLatLng(e.latlng).setContent(text).openOn(state.map);
			}
		},

		zoomTo: function(regionId) {
			if (state.dag.region(regionId)) {
				state.map.fitBounds(state.dag.region(regionId).bbox);
			}
		},
		
		//get the top-k items that are in the cells specified by cells which is an array;
		//top-k will fetch about k/cellIds.size many items per cell
		//This does not fetch top-k with respect to itemIds but rather with respect to the cells
		//This should in theory result in a good coverage of the map screen with items from all visible cells
		topKItems: function(k, offset, cellIds, cb) {
			
			var myCB = function() {
				
				//sort cellIds to always get the same order of items for a given set of cellIds
				cellIds.sort(function(a,b) {return a-b;});
				
				var activeIterators = new Set();
				var removeIterators = [];
				var resultIds = new Set();
				var result = [];
				
				for(let cellId of cellIds) {
					activeIterators.add( state.dag.cell(cellId).items.keys() );
				}
				
				while(activeIterators.size && result.length < k) {
					for(let it of activeIterators) {
						var tmp = it.next();
						while(!tmp.done) {
							let id = tmp.value;
							if (!resultIds.has(id)) {
								resultIds.add(id);
								if (offset > 0) {
									--offset;
								}
								else {
									result.push(id);
								}
								break;
							}
							else {
								tmp = it.next();
							}
						}
						if (tmp.done) {
							removeIterators.push(it);
						}
						if (result.length >= k) {
							break;
						}
					}
					
					if (removeIterators.length) {
						for(let it of removeIterators) {
							activeIterators.delete(it);
						}
					}
				}
				
				console.assert(result.length <= k);
				cb(result);
			}
			
			map.dagExpander.expandCellItems(cellIds, myCB, offset+k);
		},
	   
		//this is a recursive function, you have to clear the displayState of the dag before calling
		//childrenToFetch should be of type tools.SimpleSet() and will contain the nodes that should be expanded
		//cellsToFetch will contain the nodes whose cells are needed
		updateDag: function(node, childrenToFetch, cellsToFetch) {
			if (!node) {
				return;
			}

			if (node.children.size()) {
				for (let childId of node.children.builtinset()) {
					
					var childNode = state.dag.region(childId);
					var myOverlap = tools.percentOfOverlap(state.map, childNode.bbox);
					if (myOverlap >= 0 && state.map.getZoom() >= map.cfg.clustering.maxZoomLevel) {
						myOverlap = 100;
					}

					if (myOverlap >= config.clusters.bboxOverlap) {
						map.updateDag(childNode, childrenToFetch, cellsToFetch)
						childNode.displayState |= dag.DisplayStates.InResultsTab;
// 						if (!childNode.cells.size() && childNode.mayHaveItems) {
// 							cellsToFetch.insert(childNode.id);
// 						}
					}
					else if (myOverlap > config.clusters.shapeOverlap &&
							oscar.shapeCache.count(childNode.id) &&
							oscar.intersect(state.map.getBounds(), oscar.shapeCache.at(childNode.id)))
					{
						map.updateDag(childNode, childrenToFetch, cellsToFetch);
						childNode.displayState |= dag.DisplayStates.InResultsTab;
// 						if (!childNode.cells.size() && childNode.mayHaveItems) {
// 							cellsToFetch.insert(childNode.id);
// 						}
					}
					else { //overlap is smaller, only draw the cluster marker
						if ((childNode.clusterHint !== undefined && state.map.getBounds(). pad(config.clusters.pad).contains(childNode.clusterHint)) ||
							oscar.itemCache.count(childNode.id) && state.map.getBounds().contains(oscar.itemCache.at(childNode.id).centerPoint())
							)
						{
							childNode.displayState |= dag.DisplayStates.HasRegionClusterMarker;
						}
					}
				}
			}
			else if (node.isLeaf) {
				node.displayState |= dag.DisplayStates.InResultsTab;
				if (!node.cells.size() && node.mayHaveItems) {
					cellsToFetch.insert(node.id);
				}
			}
			else {//fetch children
				childrenToFetch.insert(node.id);
			}
		},
		
		viewChanged: function() {
			if (state.dag.hasRegion(0xFFFFFFFF)) {
				map.mapViewChanged(0xFFFFFFFF);
			}
		},
		
		expandRegion: function(parentId, cb) {
			map.dagExpander.expandRegionChildren(parentId, cb);
		},
		
		mapViewChanged: function() {
			if (state.dag.region(0xFFFFFFFF) && state.dag.region(0xFFFFFFFF).count >= map.cfg.clustering.threshold) {
				//this should remove those awfull long stacks
				setTimeout(function() {
					map._mapViewChanged();
				}, 0);
			}
		},
		
		//function to calculate the dag state from our current mapview
		_dagStateFromMapView: function() {
			var cbh;
			var childrenToFetch = tools.SimpleSet();
			var cellsToFetch = tools.SimpleSet();
			
			state.dag.clearDisplayState();
			
			map.updateDag(state.dag.region(0xFFFFFFFF), childrenToFetch, cellsToFetch);
			
			//get the children and the cells of regions that expand their cells
			if (childrenToFetch.size() || cellsToFetch.size()) {
				cbh = tools.AsyncCallBackHandler(2, function() {
					map.mapViewChanged();
				});
				var myWrapper = function(regionsToExpand, regionCellsToExpand, cbh) {
					if (regionsToExpand.length) {
						map.dagExpander.expandRegionChildren(regionsToExpand, function() { cbh.inc();});
					}
					else{
						cbh.inc();
					}
					if (regionCellsToExpand.length) {
						map.dagExpander.expandRegionCells(regionCellsToExpand, function() { cbh.inc();});
					}
					else {
						cbh.inc();
					}
				}
				myWrapper(childrenToFetch.toArray(), cellsToFetch.toArray(), cbh);
			}
			
			//now mark all the cells accordingly
			state.dag.each(function(node) {
				for(let cellId of node.cells.builtinset()) {
					state.dag.cell(cellId).displayState |= node.displayState;
				}
			}, dag.NodeTypes.Region);
			
			//and now check for each region that has the displayState == InResultsTab
			//if at least one of its cells that overlaps the current map bounds has the state InResultsTab
			//bottom-up traversal makes sure that only the lowest region will get a tab
			var currentMapBounds = state.map.getBounds();
			var maxOverlap = 0.0;
			var maxOverlapRegionId = -1;
			state.dag.bottomUp(state.dag.region(0xFFFFFFFF), function(node) {
				if (node.displayState & dag.DisplayStates.InResultsTab) {
					let ok = false;
					let hasMaxOverlapCell = false;
					let xCells = [];
					for(let cellId of node.cells.builtinset()) {
						let cellNode = state.dag.cell(cellId);
						let ds = cellNode.displayState & (dag.DisplayStates.HasRegionClusterMarker | dag.DisplayStates.InResultsTab2);
						let xMap = currentMapBounds.intersects(cellNode.bbox);
						if (ds === 0 && xMap) {
							let pOv = tools.percentOfOverlap(state.map, cellNode.bbox);
							if (pOv >= config.clusters.shapeOverlap || state.map.getZoom() >= map.cfg.clustering.maxZoomLevel) {
								ok = true;
								cellNode.displayState |= dag.DisplayStates.InResultsTab2;
								if (pOv > maxOverlap) {
									maxOverlap = pOv;
									hasMaxOverlapCell = true;
								}
							}
							else {
								xCells.push(cellId);
							}
						}
						cellNode.displayState &= ~dag.DisplayStates.InResultsTab;
					}
					
					if (ok) {
						////at least one cell is large enough to be shown, add all intersecting cells as-well
						//TODO: add cell cluster markers instead
						for(let cellId of xCells) {
							var cellNode = state.dag.cell(cellId);
							cellNode.displayState |= dag.DisplayStates.InResultsTab2;
						}
					}
					//no cell is marked for this region
					if (!ok) {
						node.displayState &= ~dag.DisplayStates.InResultsTab;
						//no cell is marked for this region this either means that all 
						//cells were used by other regions or the cells are too small to be displayed
						//if the former is the case then everything is fine
						//but in the later case we should add a cluster marker for this region
						ok = !node.cells.size();
						for(let cellId of node.cells.builtinset()) {
							var cellNode = state.dag.cell(cellId);
							var ds = cellNode.displayState & (dag.DisplayStates.HasRegionClusterMarker | dag.DisplayStates.InResultsTab2);
							ok = ok || ds;
						}
						if (!ok) { //no cell is covered by a tab or a cluster marker, so we add one
							node.displayState |= dag.DisplayStates.HasRegionClusterMarker;
							for(let cellId of node.cells.builtinset()) {
								var cellNode = state.dag.cell(cellId);
								cellNode.displayState |= dag.DisplayStates.HasRegionClusterMarker;
							}
						}
					}
					//this region has the cell with maximum overlap
					else if (ok && hasMaxOverlapCell) {
						maxOverlapRegionId = node.id;
					}
				}
			}, dag.NodeTypes.Region);
			
			//reset the cell display states to the original values
			state.dag.each(function(node) {
				if (node.displayState & dag.DisplayStates.InResultsTab) {
					for(let cellId of node.cells.builtinset()) {
						var cellNode = state.dag.cell(cellId);
						if (cellNode.displayState & dag.DisplayStates.InResultsTab2) {
							cellNode.displayState = dag.DisplayStates.InResultsTab;
						}
					}
				}
			}, dag.NodeTypes.Region);
			
			//cells now hold the correct display state (either InResultsTab or HasRegionClusterMarker)
			//regions now hold the correct display state as well
		},
		_assignClusterMarkers: function(wantClusterMarkers) {
			var removedClusterMarkers = tools.SimpleSet();
			var missingClusterMarkers = tools.SimpleSet();
			tools.getMissing(wantClusterMarkers, map.clusterMarkers.layers(), removedClusterMarkers, missingClusterMarkers);
		
			removedClusterMarkers.each(function(key) {
				map.clusterMarkers.remove(key);
			});
			missingClusterMarkers.each(function(key) {
				map.clusterMarkers.add(key, state.dag.region(key).count);
			});
			
			if (map.cfg.clusterShapes.choropleth.display) {
				var removedRegionShapes = tools.SimpleSet();
				var missingRegionShapes = tools.SimpleSet();
				tools.getMissing(wantClusterMarkers, map.choroplethMapShapes.layers(), removedRegionShapes, missingRegionShapes);
			
				removedRegionShapes.each(function(key) {
					map.choroplethMapShapes.remove(key);
				});
				
				
				let myMaxCount = 0;
				let myTotalCount = 0;
				let myTotalArea = 0;
				wantClusterMarkers.each(function(key) {
					let rn = state.dag.region(key);
					myMaxCount = Math.max(myMaxCount, rn.count);
					myTotalCount += rn.count;
					if (rn.area) {
						myTotalArea += rn.area;
					}
					else {
						let b = L.latLngBounds(rn.bbox);
						let poly = [b.getSouthWest(), b.getNorthWest(), b.getNorthEast(), b.getSouthEast()];
						myTotalArea += map.choroplethMapShapes.geodesicArea(poly);
					}
				});
				map.choroplethMapShapes.setMaxCount(myMaxCount);
				map.choroplethMapShapes.setTotalCount(myTotalCount);
				map.choroplethMapShapes.setTotalArea(myTotalArea);
// 				map.choroplethMapShapes.setTotalAreaFromViewPort();
				
				map.choroplethMapShapes.recomputeColors();
				
				missingRegionShapes.each(function(key) {
					map.choroplethMapShapes.add(key);
				});
			}
			else {
				map.choroplethMapShapes.clear();
			}
		},
		//cells are tools.SimpleSet
		_assignTabContentFromRegion: function(cells, regionId, focusAfterLoad) {
			var removedCells = tools.SimpleSet();
			var missingCells = tools.SimpleSet();
			tools.getMissing(cells, map.resultListTabs.cells(regionId), removedCells, missingCells);
			//nothing to change
			if (!missingCells.size() && !removedCells.size()) {
				if (focusAfterLoad) {
					map.resultListTabs.activateTab(regionId);
				}
				return;
			}
			map.resultListTabs.setCells(regionId, cells, function() {
				if (focusAfterLoad) {
					map.resultListTabs.activateTab(regionId);
				}
			});
		},
		
	   //@param wantTabListRegions tools.SimpleSet
		_assignTabs: function(wantTabListRegions, maxOverlapRegionId) {
			//only add the world tab if there are other tabs
			if (wantTabListRegions.size()) {
				if (!map.resultListTabs.count(0xFFFFFFFF)) {
					var rn = state.dag.region(0xFFFFFFFF);
					map.resultListTabs.addTab(0xFFFFFFFF, rn.name, rn.count, true);
				}
				wantTabListRegions.insert(0xFFFFFFFF);
			}
			else { //check if we need to remove some tabs
				//inspection tab is there, so we have to remove the other tabs explicitly
				if (!map.cfg.resultList.regionTabs && map.resultListTabs.count(INSPECTION_TAB_ID)) {
					var tabs2Remove = [];
					for(let tabId of map.resultListTabs.tabIds()) {
						if (tabId != INSPECTION_TAB_ID) {
							tabs2Remove.push(tabId);
						}
					}
					for(let tabId of tabs2Remove) {
						map.resultListTabs.removeTab(tabId);
					}
				}
				else {
					map.resultListTabs.clear();
				}
				return;
			}
			///keep the inspection tab if it is there
			if (map.resultListTabs.count(INSPECTION_TAB_ID)) {
				wantTabListRegions.insert(INSPECTION_TAB_ID);
			}
			
			var worldCells = tools.SimpleSet();
			
			//make sure that the active region tab stays the same if it was set before
			if (wantTabListRegions.count( map.resultListTabs.activeTabId() )) {
				maxOverlapRegionId = map.resultListTabs.activeTabId();
			}
			else if (!map.cfg.resultList.focusMaxOverlapTab) {
				maxOverlapRegionId = 0xFFFFFFFF;
			}
			
			if (map.cfg.resultList.regionTabs) {
				var removedTabs = [];
				for(let tabId of map.resultListTabs.tabIds()) {
					if (!wantTabListRegions.count(tabId)) {
						removedTabs.push(tabId);
					}
				}
				for(let tabId of removedTabs) {
					map.resultListTabs.removeTab(tabId);
				}
			}

			wantTabListRegions.each(function(regionId) {
				if (parseInt(regionId) === 0xFFFFFFFF) {
					return;
				}
				if (map.cfg.resultList.regionTabs) {
					var wantCells = tools.SimpleSet();
					state.dag.region(regionId).cells.each(function(cellId) {
						if (state.dag.cell(cellId).displayState & dag.DisplayStates.InResultsTab) {
							worldCells.insert(cellId);
							wantCells.insert(cellId);
						}
					});
					if (!map.resultListTabs.count(regionId)) {
						var rn = state.dag.region(regionId);
						map.resultListTabs.addTab(regionId, rn.name, rn.count);
					}
					map._assignTabContentFromRegion(wantCells, regionId, parseInt(regionId) === maxOverlapRegionId);
				}
				else {
					state.dag.region(regionId).cells.each(function(cellId) {
						if (state.dag.cell(cellId).displayState & dag.DisplayStates.InResultsTab) {
							worldCells.insert(cellId);
						}
					});
				}
			});

			if (worldCells.size()) {
				map._assignTabContentFromRegion(worldCells, 0xFFFFFFFF, maxOverlapRegionId === WORLD_TAB_ID);
			}
		},
		
		_mapViewChanged: function() {
			if (map.locks.mapViewChanged.locked) {
				map.locks.mapViewChanged.queued = true;
				return;
			}
			map.locks.mapViewChanged.locked = true;
			
			var timers = {
				complete: tools.timer("mapViewChanged::complete"),
				updateDag: tools.timer("mapViewChanged::updateDag"),
				clusterUpdate: tools.timer("mapViewChanged::clusterUpdate"),
				tabUpdate: tools.timer("mapViewChanged::tabUpdate")
			};
			
			map.closePopups();
			
			
			timers.updateDag.start();
			{
				map._dagStateFromMapView();
			}
			timers.updateDag.stop();

			
			//the dag now holds the state the gui should have
			//let's get them synchronized
			//recycle as many markers, tabs etc. as possible
			//remove disabled markers/tabs etc
			//add new markers/tabs etc.

			var wantTabListRegions = tools.SimpleSet();
			var wantClusterMarkers = tools.SimpleSet();
			state.dag.each(function(node) {
				if (node.displayState & dag.DisplayStates.HasRegionClusterMarker) {
					wantClusterMarkers.insert(node.id);
				}
				if (node.displayState & dag.DisplayStates.InResultsTab) {
					wantTabListRegions.insert(node.id);
				}
			}, dag.NodeTypes.Region);
			
			timers.clusterUpdate.start();
			{
				map._assignClusterMarkers(wantClusterMarkers);
			}
			timers.clusterUpdate.stop();
			
			timers.tabUpdate.start();
			{
				map._assignTabs(wantTabListRegions);
			}
			timers.tabUpdate.stop();

			timers.complete.stop();
			if (map.locks.mapViewChanged.queued) {
				//this is guaranteed to be running before any other call to mapViewChanged
				//due to the lock that is NOT released yet
				setTimeout(function() {
					map.locks.mapViewChanged.locked = false;
					map.locks.mapViewChanged.queued = false;
					map.mapViewChanged();
				}, 0);
			}
			else {
				map.locks.mapViewChanged.locked = false;
			}
		},
		
		//starts the clustering by expanding the view to the ohPath
		//it then hand everything off to mapViewChanged
		startClustering: function() {
			var cqr = state.cqr;
			var spinnerId = state.startLoadingSpinner();
			map.dagExpander.expandRegionChildren(([0xFFFFFFFF]).concat(cqr.ohPath()), function() {
				state.endLoadingSpinner(spinnerId);
				//everything is there
				var rid = 0xFFFFFFFF;
				// fit the viewport to the target region
				if (cqr.ohPath().length) {
					var path = cqr.ohPath();
					rid = path[path.length - 1];
					state.map.fitBounds(state.dag.region(rid).bbox);
				}
				else {
					state.map.fitWorld();
				}
				map.mapViewChanged(rid);
				state.map.on("zoomend dragend", map.viewChanged);
			});
		},
	   
		displayAllItems: function() {
			var cqr = state.cqr;
			var rn = state.dag.region(0xFFFFFFFF);
			map.resultListTabs.addTab(0xFFFFFFFF, rn.name, rn.count, true);
			cqr.cells([0xFFFFFFFF], function(cellInfo) {
				if (cqr.sequenceId() !== state.cqr.sequenceId()) {
					return;
				}
				var rootNode = state.dag.region(0xFFFFFFFF);
				for(let cellId of cellInfo[0xFFFFFFFF]) {
					var cellNode = state.dag.addNode(cellId, dag.NodeTypes.Cell);
					state.dag.addEdge(rootNode, cellNode);
				}
				map.resultListTabs.setCells(0xFFFFFFFF, rootNode.cells);
			}, tools.defErrorCB);
			if (cqr.ohPath().length) {
				var path = cqr.ohPath();
				rid = path[path.length - 1];
				oscar.getItem(rid, function(item) {
					if (cqr.sequenceId() !== state.cqr.sequenceId()) {
						return;
					}
					state.map.fitBounds( item.bbox() );
				});
			}
			else {
				state.map.fitWorld();
			}
		},
	   
		closePopups: function () {
			var closeElement = $(".leaflet-popup-close-button")[0];
			if (closeElement !== undefined) {
				closeElement.click();
			}
		},

		addClusterMarker: function (node) {
			map.clusterMarkers.add(node.id, node.count);
		}
    };
	console.assert(state.map === undefined, state.map);
	// init the map and sidebar
	state.map = L.map('map', {
		zoomControl: true
	}).setView([48.74568, 9.1047], 17);
	state.map.zoomControl.setPosition('topright');
	state.sidebar = L.control.sidebar('sidebar').addTo(state.map);
	var osmAttr = '&copy; <a target="_blank" href="https://www.openstreetmap.org">OpenStreetMap</a>';
    var osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: osmAttr,
        minZoom: 0,
        maxZoom: 18
    });
	// var bingLayer = L.tileLayer.bing(config.map.apikeys.bing);
    var fmiLayer = L.tileLayer('https://tiles.fmi.uni-stuttgart.de/{z}/{x}/{y}.png', {
        attribution: osmAttr,
        minZoom: 0,
        maxZoom: 18
    });
	
	state.map.addLayer(fmiLayer); //currently not available
// 	state.map.addLayer(osmLayer);
	
// 	L.control.layers({"OpenStreetMap FMI" : fmiLayer, "Bing Aerial" : bingLayer, "OpenStreetMap" : osmLayer}).addTo(state.map);
	
// 	state.map.addLayer(bingLayer);
	//init map module
	map.init();

	return map;
});
