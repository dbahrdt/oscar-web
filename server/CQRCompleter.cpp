#include "CQRCompleter.h"
#include "BinaryWriter.h"
#include <cppcms/http_response.h>
#include <cppcms/http_request.h>
#include <cppcms/url_dispatcher.h>
#include <cppcms/url_mapper.h>
#include <cppcms/json.h>
#include <sserialize/Static/GeoHierarchy.h>
#include <sserialize/stats/TimeMeasuerer.h>
#include <sserialize/utility/printers.h>

namespace oscar_web {

void CQRCompleter::writeLogStats(const std::string& query, const sserialize::TimeMeasurer& tm, uint32_t cqrSize, uint32_t idxSize) {
	*(m_dataPtr->log) << "CQRCompleter: t=" << tm.beginTime() << "s, rip=" << request().remote_addr() << ", q=[" << query << "], rs=" << cqrSize <<  " is=" << idxSize << ", ct=" << tm.elapsedMilliSeconds() << "ms" << std::endl;
}


CQRCompleter::CQRCompleter(cppcms::service& srv, const CompletionFileDataPtr & dataPtr) :
application(srv),
m_dataPtr(dataPtr),
m_subSetSerializer(dataPtr->completer->store().geoHierarchy()),
m_cqrSerializer(dataPtr->completer->indexStore().indexType())
{
	dispatcher().assign("/clustered/full", &CQRCompleter::fullCQR, this);
	dispatcher().assign("/clustered/simple", &CQRCompleter::simpleCQR, this);
	dispatcher().assign("/clustered/children", &CQRCompleter::children, this);
	dispatcher().assign("/clustered/michildren", &CQRCompleter::maximumIndependentChildren, this);
	dispatcher().assign("/clustered/items", &CQRCompleter::items, this);
	mapper().assign("clustered","/clustered");
}

CQRCompleter::~CQRCompleter() {}


void CQRCompleter::writeSubSet(std::ostream& out, const std::string & sst, const sserialize::Static::spatial::GeoHierarchy::SubSet& subSet) {
	if (sst == "flatxml") {
		m_subSetSerializer.toFlatXML(out, subSet);
	}
	else if (sst == "treexml") {
		m_subSetSerializer.toTreeXML(out, subSet);
	}
	else if (sst == "flatjson") {
		m_subSetSerializer.toJson(out, subSet);
	}
	else if (sst == "binary") {
		m_subSetSerializer.toBinary(out, subSet);
	}
}

void CQRCompleter::fullCQR() {
	sserialize::TimeMeasurer ttm;
	ttm.begin();

	std::string cqs = request().get("q");
	std::string regionFilter = request().get("rf");
	std::string sst = request().get("sst");
	bool ssonly = sserialize::toBool(request().get("ssonly"));
	
	std::cout << "query is: " << cqs << std::endl;
	
	sserialize::Static::spatial::GeoHierarchy::SubSet subSet;
	if (m_dataPtr->ghSubSetCreators.count(regionFilter)) {
		subSet = m_dataPtr->completer->clusteredComplete(cqs, m_dataPtr->ghSubSetCreators.at(regionFilter), m_dataPtr->fullSubSetLimit, m_dataPtr->treedCQR);
	}
	else {
		subSet = m_dataPtr->completer->clusteredComplete(cqs, m_dataPtr->fullSubSetLimit, m_dataPtr->treedCQR);
	}
	
	std::cout << "cqr.size=" << subSet.cqr().cellCount() << std::endl;
	
	if (!ssonly || sst == "binary") {
		response().set_content_header("application/octet-stream");
	}
	else {
		if (sst == "flatjson") {
			response().set_content_header("application/json");
		}
		else {
			response().set_content_header("application/xml");
		}
	}
	
	std::ostream & out = response().out();

	sserialize::TimeMeasurer tm;
	if (!ssonly) {
		tm.begin();
		m_cqrSerializer.write(out, subSet.cqr());
		tm.end();
		std::cout << "Time to write cqr: " << tm.elapsedMilliSeconds() << " msec" << std::endl;
	}
	tm.begin();
	writeSubSet(out, sst, subSet);
	tm.end();
	ttm.end();
	std::cout << "Time to write SubSet: "<< tm.elapsedMilliSeconds() << " ms " << std::endl;
	writeLogStats(cqs, ttm, subSet.cqr().cellCount(), 0);
}

void CQRCompleter::simpleCQR() {
	typedef sserialize::Static::spatial::GeoHierarchy GeoHierarchy;
	typedef GeoHierarchy::SubSet::NodePtr SubSetNodePtr;
	typedef std::unordered_set<const sserialize::Static::spatial::GeoHierarchy::SubSet::Node*> RegionSet;
	sserialize::TimeMeasurer ttm;
	ttm.begin();

	const sserialize::Static::spatial::GeoHierarchy & gh = m_dataPtr->completer->store().geoHierarchy();

	response().set_content_header("text/json");
	
	//params
	std::string cqs = request().get("q");
	std::string regionFilter = request().get("rf");
	uint32_t cqrSize = 0;
	double ohf = 0.0;
	bool globalUnfoldRatio = true;

	//local
	RegionSet regions;
	std::vector<uint32_t> ohPath;
	SubSetNodePtr subSetRootPtr;
	
	{
		std::string tmpStr = request().get("oh");
		if (!tmpStr.empty()) {
			ohf = atof(tmpStr.c_str());
			if (ohf >= 1.0 || ohf < 0.0) {
				ohf = 0.0;
			}
		}
		tmpStr = request().get("oht");
		if (tmpStr == "relative") {
			globalUnfoldRatio = false;
		}
	}
	
	GeoHierarchy::SubSet subSet;
	if (m_dataPtr->ghSubSetCreators.count(regionFilter)) {
		subSet = m_dataPtr->completer->clusteredComplete(cqs, m_dataPtr->ghSubSetCreators.at(regionFilter), m_dataPtr->fullSubSetLimit, m_dataPtr->treedCQR);
	}
	else {
		subSet = m_dataPtr->completer->clusteredComplete(cqs, m_dataPtr->fullSubSetLimit, m_dataPtr->treedCQR);
	}
	
	GeoHierarchy::SubSet::NodePtr rPtr(subSet.root());
	subSetRootPtr = rPtr;
	cqrSize = subSet.cqr().cellCount(); //for stats
	if (ohf != 0.0) {
		struct MyIterator {
			std::vector<uint32_t> * ohPath;
			RegionSet * regions;
			const GeoHierarchy * gh;
			MyIterator & operator*() { return *this; }
			MyIterator & operator++() { return *this; }
			MyIterator & operator=(const SubSetNodePtr & node) {
				uint32_t storeId = gh->ghIdToStoreId( node->ghId() );
				ohPath->push_back(storeId);
				regions->insert(node.get());
				return *this;
			}
			MyIterator(std::vector<uint32_t> * ohPath, RegionSet * regions, const GeoHierarchy * gh) :
			ohPath(ohPath), regions(regions), gh(gh)
			{}
		};
		
		subSet.pathToBranch(MyIterator(&ohPath, &regions, &gh), ohf, globalUnfoldRatio);
	}
	//now write the data
	BinaryWriter bw(response().out());

	//root region apx item count
	bw.putU32(subSetRootPtr->maxItemsSize());
	
	//ohPath
	bw.putU32(ohPath.size());
	for(auto x : ohPath) {
		bw.putU32(x);
	}
	bw.putU32(regions.size()+1);
	bw.putU32(subSetRootPtr->size()*2+1);
	bw.putU32(0xFFFFFFFF);//root node id
	for(const SubSetNodePtr & x : *subSetRootPtr) {
		bw.putU32( gh.ghIdToStoreId(x->ghId()) );
		bw.putU32( x->maxItemsSize() );
	}
	for(auto x : regions) {
		bw.putU32(x->size()*2+1);
		bw.putU32( gh.ghIdToStoreId(x->ghId()) );
		for(const SubSetNodePtr & c : *x) {
			bw.putU32( gh.ghIdToStoreId(c->ghId()) );
			bw.putU32( c->maxItemsSize() );
		}
	}

	ttm.end();
	std::cout << "oscar_web::CQRCompleter::simpleCQR: query=" << cqs << ", cqr.size=" << cqrSize <<  " took " << ttm.elapsedMilliSeconds() << " ms" << std::endl;
	writeLogStats(cqs, ttm, cqrSize, 0);
}

void CQRCompleter::items() {
	const sserialize::Static::spatial::GeoHierarchy & gh = m_dataPtr->completer->store().geoHierarchy();
	
	sserialize::TimeMeasurer ttm;
	ttm.begin();

	response().set_content_header("text/json");
	
	//params
	std::string cqs = request().get("q");
	uint32_t regionId = sserialize::Static::spatial::GeoHierarchy::npos;
	uint32_t numItems = 0;
	uint32_t skipItems = 0;
	uint32_t cqrSize = 0;

	
	{
		std::string tmpStr = request().get("r");
		if (!tmpStr.empty()) {
			regionId = std::min<int64_t>(atoi(tmpStr.c_str()), gh.regionSize());
		}
		tmpStr = request().get("k");
		if (!tmpStr.empty()) {
			numItems = std::min<uint32_t>(m_dataPtr->maxItemDBReq, atoi(tmpStr.c_str()));
		}
		tmpStr = request().get("o");
		if (!tmpStr.empty()) {
			skipItems = atoi(tmpStr.c_str());
		}
	}
	
	if (regionId != sserialize::Static::spatial::GeoHierarchy::npos) {
		cqs = sserialize::toString("$region:", regionId, " (", cqs, ")");
	}
	
	sserialize::CellQueryResult cqr(m_dataPtr->completer->cqrComplete(cqs, m_dataPtr->treedCQR));
	sserialize::ItemIndex idx(cqr.topK(numItems+skipItems));
	cqrSize = cqr.cellCount();
	
	//now write the data
	BinaryWriter bw(response().out());
	if (skipItems >= idx.size()) {
		bw.putU32(0);
	}
	else {
		numItems = std::min<uint32_t>(idx.size() - skipItems, numItems);
		bw.putU32(numItems);
		for(uint32_t i(skipItems), s(skipItems+numItems); i < s; ++i) {
			bw.putU32(idx.at(i));
		}
	}

	ttm.end();
	std::cout << "oscar_web::CQRCompleter::items: query=" << cqs << ", cqr.size=" << cqrSize << ", idx.size=" << idx.size() <<  " took " << ttm.elapsedMilliSeconds() << " ms" << std::endl;
	writeLogStats(cqs, ttm, cqrSize, idx.size());
}

void CQRCompleter::children() {
	typedef sserialize::Static::spatial::GeoHierarchy::SubSet::NodePtr SubSetNodePtr;
	
	sserialize::TimeMeasurer ttm;
	ttm.begin();
	const sserialize::Static::spatial::GeoHierarchy & gh = m_dataPtr->completer->store().geoHierarchy();

	response().set_content_header("text/json");
	
	//params
	std::string cqs = request().get("q");
	std::string regionFilter = request().get("rf");
	uint32_t regionId = sserialize::Static::spatial::GeoHierarchy::npos;
	uint32_t cqrSize = 0;

	{
		std::string tmpStr = request().get("r");
		if (!tmpStr.empty()) {
			regionId = atoi(tmpStr.c_str());
		}
	}
	
	if (regionId != sserialize::Static::spatial::GeoHierarchy::npos) {
		cqs = sserialize::toString("$region:", regionId, " (", cqs, ")");
	}

	sserialize::Static::spatial::GeoHierarchy::SubSet subSet;
	if (m_dataPtr->ghSubSetCreators.count(regionFilter)) {
		subSet = m_dataPtr->completer->clusteredComplete(cqs, m_dataPtr->ghSubSetCreators.at(regionFilter), m_dataPtr->fullSubSetLimit, m_dataPtr->treedCQR);
	}
	else {
		subSet = m_dataPtr->completer->clusteredComplete(cqs, m_dataPtr->fullSubSetLimit, m_dataPtr->treedCQR);
	}
	
	sserialize::Static::spatial::GeoHierarchy::SubSet::NodePtr rPtr(regionId != sserialize::Static::spatial::GeoHierarchy::npos ? subSet.regionByStoreId(regionId) : subSet.root());
	cqrSize = subSet.cqr().cellCount(); //for stats

	//now write the data
	BinaryWriter bw(response().out());
	if (rPtr) {
		bw.putU32(rPtr->size()*2);
		for(const SubSetNodePtr & x : *rPtr) {
		bw.putU32( gh.ghIdToStoreId(x->ghId()) );
			bw.putU32( x->maxItemsSize() );
		}
	}
	else {
		bw.putU32(0);
	}

	ttm.end();
	std::cout << "oscar_web::CQRCompleter::children: query=" << cqs << ", cqr.size=" << cqrSize  << " took " << ttm.elapsedMilliSeconds() << " ms" << std::endl;
	writeLogStats(cqs, ttm, cqrSize, 0);
}

void CQRCompleter::maximumIndependentChildren() {
	typedef sserialize::Static::spatial::GeoHierarchy::SubSet::NodePtr SubSetNodePtr;
	
	sserialize::TimeMeasurer ttm;
	ttm.begin();
	const sserialize::Static::spatial::GeoHierarchy & gh = m_dataPtr->completer->store().geoHierarchy();

	response().set_content_header("text/json");
	
	//params
	std::string cqs = request().get("q");
	std::string regionFilter = request().get("rf");
	uint32_t regionId = sserialize::Static::spatial::GeoHierarchy::npos;
	uint32_t cqrSize = 0;
	uint32_t overlap = 0;

	{
		std::string tmpStr = request().get("r");
		if (!tmpStr.empty()) {
			regionId = atoi(tmpStr.c_str());
		}
		
		tmpStr = request().get("o");
		if (!tmpStr.empty()) {
			overlap = atoi(tmpStr.c_str());
		}
	}
	
	if (regionId != sserialize::Static::spatial::GeoHierarchy::npos) {
		cqs = sserialize::toString("$region:", regionId, " (", cqs, ")");
	}
	
	sserialize::Static::spatial::GeoHierarchy::SubSet subSet;
	if (m_dataPtr->ghSubSetCreators.count(regionFilter)) {
		subSet = m_dataPtr->completer->clusteredComplete(cqs, m_dataPtr->ghSubSetCreators.at(regionFilter), m_dataPtr->fullSubSetLimit, m_dataPtr->treedCQR);
	}
	else {
		subSet = m_dataPtr->completer->clusteredComplete(cqs, m_dataPtr->fullSubSetLimit, m_dataPtr->treedCQR);
	}
	
	sserialize::Static::spatial::GeoHierarchy::SubSet::NodePtr rPtr(regionId != sserialize::Static::spatial::GeoHierarchy::npos ? subSet.regionByStoreId(regionId) : subSet.root());
	cqrSize = subSet.cqr().cellCount(); //for stats

	//now write the data
	std::ostream & out = response().out();
	if (rPtr && rPtr->size()) {
		char delim = '[';
		std::vector<uint32_t> pickedRegions;
		std::vector< std::pair<uint32_t, uint32_t> > count2Pos;
		for(uint32_t i(0), s(rPtr->size()); i < s; ++i) {
			count2Pos.emplace_back(rPtr->at(i)->maxItemsSize(), i);
		}
		std::sort(count2Pos.begin(), count2Pos.end(), std::greater< std::pair<uint32_t, uint32_t> >());
		std::unordered_set<uint32_t> pickedCellPositions;
		if (subSet.sparse()) {
			std::vector<uint32_t> currentChildCellPositions;
			struct Calc {
				std::unordered_set<uint32_t> * pickedCellPositions;
				std::vector<uint32_t> * currentChildCellPositions;
				bool operator()(const SubSetNodePtr & node) {
					bool ok = true;
					for(uint32_t x : node->cellPositions()) {
						if (pickedCellPositions->count(x)) {
							ok = false;
							break;
						}
					}
					if (ok) {
						currentChildCellPositions->insert(currentChildCellPositions->end(), node->cellPositions().begin(), node->cellPositions().end());
						for(const auto & c : *node) {
							if (!this->operator()(c)) {
								return false;
							}
						}
						return true;
					}
					else {
						return false;
					}
				}
			} calc;
			calc.currentChildCellPositions = &currentChildCellPositions;
			calc.pickedCellPositions = &pickedCellPositions;
			for(uint32_t i(0), s(rPtr->size()); i < s; ++i) {
				currentChildCellPositions.clear();
				bool ok = true;
				uint32_t rPos = count2Pos[i].second;
				const auto & cPtr = rPtr->at(rPos);
				if (overlap) {
					cPtr->visit([&currentChildCellPositions](const SubSetNodePtr::element_type & node) {
						currentChildCellPositions.insert(currentChildCellPositions.end(), node.cellPositions().begin(), node.cellPositions().end());
					});
					uint32_t myOverlappCount = 0;
					for(auto x : currentChildCellPositions) {
						if (pickedCellPositions.count(x)) {
							++myOverlappCount;
						}
					}
					ok = 100*myOverlappCount/cPtr->cellPositions().size() < overlap;
				}
				else {
					ok = calc(cPtr);
				}
				if (ok) {
					pickedCellPositions.insert(currentChildCellPositions.begin(), currentChildCellPositions.end());
					out << delim << gh.ghIdToStoreId(cPtr->ghId());
					delim = ',';
				}
			}
		}
		else {
			for(uint32_t i(0), s(rPtr->size()); i < s; ++i) {
				uint32_t rPos = count2Pos[i].second;
				bool ok = true;
				const auto & cPtr = rPtr->at(rPos);
				const auto & cCp = cPtr->cellPositions();
				if (overlap) {
					uint32_t myOverlappCount = 0;
					for(uint32_t x : cCp) {
						if (pickedCellPositions.count(x)) {
							++myOverlappCount;
						}
					}
					ok = 100*myOverlappCount/cCp.size()< overlap;
				}
				else {
					for(uint32_t x : cCp) {
						if (pickedCellPositions.count(x)) {
							ok = false;
							break;
						}
					}
				}
				if (ok) {
					pickedCellPositions.insert(cCp.begin(), cCp.end());
					out << delim << gh.ghIdToStoreId(cPtr->ghId());
					delim = ',';
				}
			}
		}
		out << "]";
	}
	else {
		out << "[]";
	}

	ttm.end();
	std::cout << "oscar_web::CQRCompleter::maximumIndependentChildren: query=" << cqs << ", cqr.size=" << cqrSize  << " took " << ttm.elapsedMilliSeconds() << " ms" << std::endl;
	writeLogStats(cqs, ttm, cqrSize, 0);
	
}

}//end namespace