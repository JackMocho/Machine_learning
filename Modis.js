//Welcome to Geospatial world!
var aoi = ee.Geometry.Polygon([
  [[36.802, -1.46], [36.961, 0.213], [35.222, 0.279], [35.053, -0.66]]
]);
var modis = ee.ImageCollection('MODIS/006/MOD13Q1')
  .filterDate('2010-01-01', '2020-12-31')
  .filterBounds(aoi);
var maskQuality = function(image) {
  var qa = image.select('SummaryQA');
  var mask = qa.lte(1);
  return image.updateMask(mask).select('NDVI');
};
var ndviCollection = modis.map(maskQuality);
print('Number of MODIS images:', ndviCollection.size());
var landCover = ee.ImageCollection('MODIS/006/MCD12Q1')
  .filterDate('2010-01-01', '2020-12-31')
  .filterBounds(aoi)
  .select('LC_Type1');
var lc2020 = landCover.filterDate('2020-01-01', '2020-12-31').first().clip(aoi);
var lcVisParams = {
  min: 1, 
  max: 17,
  palette: [
    '05450a', '086a10', '54a708', '78d203', '009900', 'c6b044', 'dcd159',
    'dade48', 'fbff13', 'b6ff05', '27ff87', 'c24f44', 'a5a5a5', 'ff6d4c',
    '69fff8', 'f9ffa4', '1c0dff'
  ]
};
Map.addLayer(lc2020, lcVisParams, 'Land Cover 2020');

var landCover = ee.ImageCollection('MODIS/006/MCD12Q1')
  .filterBounds(aoi)
  .select('LC_Type1');
var lcLatest = landCover.filterDate('2020-01-01', '2020-12-31')
  .first()
  .clip(aoi);
print('Latest land cover image:', lcLatest);
Map.addLayer(lcLatest, lcVisParams, 'Land Cover 2020');
var chirps = ee.ImageCollection('UCSB-CHG/CHIRPS/DAILY')
  .filterDate('2010-01-01', '2020-12-31')
  .filterBounds(aoi);
var monthlyPrecip = ee.ImageCollection.fromImages(
  ee.List.sequence(1, 12).map(function(month) {
    var monthlyMean = chirps.filter(ee.Filter.calendarRange(month, month, 'month'))
      .mean();
    return monthlyMean.set('month', month);
  })
);
var meanPrecip = monthlyPrecip.mean().clip(aoi);
Map.addLayer(meanPrecip, {min: 0, max: 200, palette: ['white', 'blue']}, 'Mean Annual Precipitation (mm)');
var ndviWithTime = ndviCollection.map(function(image) {
  var year = ee.Date(image.get('system:time_start')).difference('2010-01-01', 'year');
  return image.addBands(ee.Image(year).rename('t')).float();
});
var trend = ndviWithTime.select(['t', 'NDVI'])
  .reduce(ee.Reducer.linearFit());
var slope = trend.select('scale');
Map.addLayer(slope.clip(aoi), {min: -0.05, max: 0.05, palette: ['red', 'white', 'green']}, 'NDVI Trend');
var ndviChart = ui.Chart.image.seriesByRegion({
  imageCollection: ndviCollection,
  regions: aoi,
  reducer: ee.Reducer.mean(),
  scale: 250,
  xProperty: 'system:time_start'
}).setOptions({
  title: 'NDVI vs. Precipitation (2010-2020)',
  series: {0: {color: 'green'}, 1: {color: 'blue'}},
  vAxis: {title: 'NDVI / Precipitation (mm)'},
  hAxis: {title: 'Date'}
});
var precipChart = ui.Chart.image.seriesByRegion({
  imageCollection: chirps,
  regions: aoi,
  reducer: ee.Reducer.mean(),
  scale: 5500,
  xProperty: 'system:time_start'
}).setOptions({title: 'Monthly Precipitation'});
print(ndviChart);
print(precipChart);
var monthlyAnomalies = ndviCollection.map(function(image) {
  var date = ee.Date(image.get('system:time_start'));
  var month = date.get('month');
  var baseline = ndviCollection.filter(ee.Filter.calendarRange(month, month, 'month'))
    .mean().rename('baseline');
  return image.subtract(baseline)
    .rename('anomaly')
    .copyProperties(image, ['system:time_start']);
});
var anomalyTrend = monthlyAnomalies.map(function(image) {
  var year = ee.Date(image.get('system:time_start')).difference('2000-01-01', 'year');
  return image.addBands(ee.Image(year).rename('t')).float();
}).reduce(ee.Reducer.linearFit());

Map.addLayer(anomalyTrend.select('scale').clip(aoi), 
  {min: -0.05, max: 0.05, palette: ['red', 'white', 'green']}, 
  'Anomaly Trend (Fixed)'
);
var deforestationMask = slope.lt(-0.01).selfMask();
Map.addLayer(deforestationMask.clip(aoi), {palette: ['red']}, 'Deforestation Hotspots')
Export.image.toDrive({
  image: lc2020,
  description: 'LandCover_2020',
  fileNamePrefix: 'LandCover_2020',
  region: aoi,
  scale: 500,
  crs: 'EPSG:4326',
  maxPixels: 1e13
});
Export.image.toDrive({
  image: meanPrecip,
  description: 'Mean_Precipitation',
  fileNamePrefix: 'Mean_Precipitation',
  region: aoi,
  scale: 5500,
  crs: 'EPSG:4326',
  maxPixels: 1e13
});
Export.image.toDrive({
  image: slope.clip(aoi),
  description: 'NDVI_Trend_Slope_Export',
  fileNamePrefix: 'NDVI_Trend_Slope',
  region: aoi,
  scale: 250,
  crs: 'SR-ORG:6974',
  maxPixels: 1e13,
  fileFormat: 'GeoTIFF',
  formatOptions: {
    cloudOptimized: true
  }
});
Export.image.toDrive({
  image: deforestationMask.clip(aoi),
  description: 'Deforestation_Hotspots_Export',
  fileNamePrefix: 'Deforestation_Hotspots',
  region: aoi,
  scale: 250,
  crs: 'SR-ORG:6974',
  maxPixels: 1e13,
  fileFormat: 'GeoTIFF'
});
Export.table.toDrive({
  collection: ee.FeatureCollection(aoi),
  description: 'AOI_Boundary_Export',
  fileFormat: 'SHP'
});
Export.table.toDrive({
  collection: ee.FeatureCollection(aoi),
  description: 'AOI_Boundary_FIXED',
  fileFormat: 'SHP',
  folder: 'GEE_Exports' 
});