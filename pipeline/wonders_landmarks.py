"""Editorial selection from NRCan's official geographical names records.

Each id resolves at https://geonames.nrcan.gc.ca/search-place-names/unique?id=...
Coordinates are approximate feature points, not boundaries.
"""
LANDMARKS = [
    {'name':{'en':'Niagara Falls','fr':'Chutes Niagara'}, 'lon':-79.07472, 'lat':43.07945, 'source':'nrcan_cgn', 'geoname_id':'FDOSE'},
    {'name':{'en':'Alexandra Falls','fr':'Alexandra Falls'}, 'lon':-116.2793849, 'lat':60.5006439, 'source':'nrcan_cgn', 'geoname_id':'LAAXB'},
    {'name':{'en':'Helmcken Falls','fr':'Helmcken Falls'}, 'lon':-120.176944, 'lat':51.953889, 'source':'nrcan_cgn', 'geoname_id':'JCACO'},
    {'name':{'en':'Chute Montmorency','fr':'Chute Montmorency'}, 'lon':-71.147778, 'lat':46.890833, 'source':'nrcan_cgn', 'geoname_id':'EHHTL'},
    {'name':{'en':'Reversing Falls','fr':'Reversing Falls'}, 'lon':-66.090092, 'lat':45.26022, 'source':'nrcan_cgn', 'geoname_id':'DAXAW'},
    {'name':{'en':'Kakabeka Falls','fr':'Kakabeka Falls'}, 'lon':-89.62515, 'lat':48.40229, 'source':'nrcan_cgn', 'geoname_id':'FBSVI'},
    {'name':{'en':'Miles Canyon','fr':'Miles Canyon'}, 'lon':-135.029722, 'lat':60.664167, 'source':'nrcan_cgn', 'geoname_id':'KAEGK'},
    {'name':{'en':'Dinosaur Provincial Park','fr':'Dinosaur Provincial Park'}, 'lon':-111.5, 'lat':50.783333, 'source':'nrcan_cgn', 'geoname_id':'IATGM'},
]
