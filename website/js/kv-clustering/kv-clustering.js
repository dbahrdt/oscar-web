define(["require", "state", "jquery", "search"],
    function (require, state, $, search) {
        var kvClustering = {
            fillTable: function(cqr) {
                $.get("/oscar/kvclustering/get?q=" + cqr + "&queryId=" + state.queries.activeCqrId, function (data) {
                    if(state.queries.activeCqrId!==data.queryId)
                        return;
                    const kvClusteringList = $("#kvclustering-list");
                    kvClusteringList.empty();
                    let liAdded = false;
                    data.kvclustering.forEach(function(key){
                        if(key.clValues.length > 1){
                            kvClusteringList.append(`<li style="margin-top: 5px"><b>refine by ${key.name}(${key.count})</b></li>`);
                            key.clValues.forEach(function(value){
                                kvClusteringList.append(`<li class="refinement" id="@${key.name}:${value.name} ${cqr}"><a href="#">${value.name}(${value.count})</a></li>`);
                            });
                            liAdded = true;
                        }
                    });
                    if(!liAdded){
                        kvClusteringList.append(`<li style="margin-top: 5px">no refinements for this query</li>`);
                    }
                    kvClusteringList.removeClass("hidden");
                })
            }
        };
        return kvClustering;
    });