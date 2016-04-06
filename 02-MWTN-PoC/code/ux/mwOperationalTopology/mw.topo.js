ControllerType = {
    ODL : 0,
    STATIC : 1
}

// Class Network Element
// Will include a list of all the MW interfaces inside this element	                                    
function MwNetworkElement(id){
	this.id = id
	this.mwAirInterfaceArr = [];

	this.getId = function(){
		return this.id;
	}
}

// Class mwAirInterface LTP
function MwAirInterface(mwNetworkElement, mwAirInterfaceJson){
	this.containingMwNetworkElement = mwNetworkElement;// MwNetworkElement
	this.data = mwAirInterfaceJson;

	this.getId = function(){
		return this.containingMwNetworkElement.getId() + "-" + this.data.layerProtocol;
	}

	this.getName = function(){
		return this.data.layerProtocol;
	}

	this.getDescription = function(){
		return this.data.airInterfaceCapability.airInterfaceID;
	}

	this.isLinkUp = function(){
		return this.data.airInterfaceStatus.linkIsUp;
	}
}

// Class Link
// source and target should point to mwAirInterface object
function MwLink(id, mwAirInterface1, mwAirInterface2){
	this.id = id;
	this.mwAirInterface1 = mwAirInterface1;
	this.mwAirInterface2 = mwAirInterface2;

	this.isUp = function(){
		if (mwAirInterface1.isLinkUp() == "false" || mwAirInterface2.isLinkUp() == "false"){
			return false;
		}
		else{
			return true;
		}
	}
}

// Controller class
function ControllerData(controllerIP, controllerPort, controllerType){
	this.controllerIP = controllerIP;
	this.controllerPort = controllerPort;
	this.controllerType = controllerType;
}

//TODO run this every 1 second and update global the global structures
function getNetworkElements(controllerData, neNameArr, mwNetworkElementArr){
	// Array will be later extracted from ODL REST API
	// var mwNetworkElementArr = [];


	if (controllerData.controllerType == ControllerType.ODL){
		baseUrl = "http://" + controllerData.controllerIP + ":" + controllerData.controllerPort + "/restconf/operational/network-topology:network-topology/topology/topology-netconf";
		console.log(baseUrl);
		$.ajax({
			url: baseUrl,
			dataType: 'JSON',
			timeout: 1000, // sets timeout to 3 seconds
			async: false,
			beforeSend: function (xhr) {
			    xhr.setRequestHeader ("Authorization", "Basic " + btoa("admin:admin"));
			},
			success: function(data, status){
		    	// console.log("Data: " + data + "\nStatus: " + status);
		    	$.each(data.topology[0].node, function(index ,value){
			    	console.log("Index: " + index + "\nValue: " + value["node-id"]);
		    		nodeName = value["node-id"];
		    		if (nodeName != "controller-config"){
		    			var layerProtocoalArr = [];
				    	var mwNetworkElement = new MwNetworkElement(nodeName);
				    	// 1. Get all layer protocols from Core model
				    	$.ajax({
								url: baseUrl + "/node/" + nodeName + "/yang-ext:mount/CoreModel-CoreNetworkModule-ObjectClasses:NetworkElement/" + nodeName,
								dataType: 'JSON',
								timeout: 1000, // sets timeout to 3 seconds
								async: false,
								cache:false,
								beforeSend: function (xhr) {
								    xhr.setRequestHeader ("Authorization", "Basic " + btoa("admin:admin"));
								},
								success: function(data, status){
							    	console.log("Data Core: " + data + "\nStatus: " + status);
							    	$.each(data.NetworkElement[0]._ltpRefList, function(index, value){
							    		if (value._lpList[0].uuid.indexOf('LP-MWPS-TTP') >= 0){
											layerProtocoalArr.push(value._lpList[0].uuid);
							    			console.log("UUID: " + value._lpList[0].uuid);
							    		}
							    	});
							    },
							    error: function(jqXHR, textStatus, errorThrown) {
							    	console.log(jqXHR, textStatus, errorThrown);
							    }
							});

				    	// 2. For each layer protocol add, create new MwAirInterface and add it to mwNetworkElement
				    	for (var i = 0;i < layerProtocoalArr.length; i++){
							$.ajax({
								url: baseUrl + "/node/" + nodeName + "/yang-ext:mount/MicrowaveModel-ObjectClasses-MwConnection:MW_AirInterface_Pac/" + layerProtocoalArr[i],
								async: false,
								cache:false,
								beforeSend: function (xhr) {
								    xhr.setRequestHeader ("Authorization", "Basic " + btoa("admin:admin"));
								},
								success: function(data, status){
							    	console.log("Data: " + data + "\nStatus: " + status);

							    	mwAirInterface = new MwAirInterface(mwNetworkElement, data.MW_AirInterface_Pac[0]);
									mwNetworkElement.mwAirInterfaceArr.push(mwAirInterface);
							    }
							});
						}
						mwNetworkElementArr.push(mwNetworkElement);
					}
		    	});
		    },
		    error: function(jqXHR, textStatus, errorThrown) {
		    	console.log(jqXHR, textStatus, errorThrown);
		    }
		});
	}
	else{
		for (var i = 0; i < neNameArr.length; i++){
			$.ajax({
				url: "http://" + controllerData.controllerIP + ":" + controllerData.controllerPort + "/network-elements/" + neNameArr[i] + ".json",
    			async:false,
				cache:false,
				success: function(data, status){
			    	console.log("Data: " + JSON.stringify(data) + "\nStatus: " + status);
			    	console.log(data);
			    	var mwNetworkElement = new MwNetworkElement(neNameArr[i]);
			    	for (var j = 0; j < data.MW_AirInterface_Pac.length; j++){
			    		mwAirInterface = new MwAirInterface(mwNetworkElement, data.MW_AirInterface_Pac[j]);
						mwNetworkElement.mwAirInterfaceArr.push(mwAirInterface);
					}
					mwNetworkElementArr.push(mwNetworkElement);
	    		},
			    error: function(jqXHR, textStatus, errorThrown) {
			    	console.log(jqXHR, textStatus, errorThrown);
			    }
	    	});
		}
	}
}


function extractMwLinks(networkElementArr){

	var mwLinkArr = []; // MwLink

	for (var currentNetworkElementIndex = 0; currentNetworkElementIndex < networkElementArr.length; currentNetworkElementIndex++){
		currentNetworkElement = networkElementArr[currentNetworkElementIndex];
		
		for (var currentAirInterfaceIndex = 0; currentAirInterfaceIndex < currentNetworkElement.mwAirInterfaceArr.length; currentAirInterfaceIndex++){
			currentAirInterface = currentNetworkElement.mwAirInterfaceArr[currentAirInterfaceIndex];

			// Find the target node to add an edge
			for (var targetNetworkElementIndex = currentNetworkElementIndex + 1; targetNetworkElementIndex < networkElementArr.length; targetNetworkElementIndex++){
				targetNetworkElement = networkElementArr[targetNetworkElementIndex];
				for(var targetAirInterfaceIndex = 0; targetAirInterfaceIndex < targetNetworkElement.mwAirInterfaceArr.length; targetAirInterfaceIndex++){
					var targetAirInterface = targetNetworkElement.mwAirInterfaceArr[targetAirInterfaceIndex];
					if (currentAirInterface.data.airInterfaceConfiguration.radioSignalId == targetAirInterface.data.airInterfaceConfiguration.radioSignalId){
						mwLink = new MwLink(currentAirInterface.data.airInterfaceConfiguration.radioSignalId, currentAirInterface, targetAirInterface);
						mwLinkArr.push(mwLink);
					}
				}
			}
		}
	}

	return mwLinkArr;
}