SetDirectory[If[StringQ[$InputFileName], DirectoryName[$InputFileName], NotebookDirectory[]]];
If[!DirectoryQ["outputs"], CreateDirectory["outputs"]];

getRecs[file_] := Module[{els = Quiet@Import[file, "Elements"]},
  Which[
    ListQ[els] && MemberQ[els, "Data"], Import[file, "Data"],
    ListQ[els] && MemberQ[els, "ShapeRecords"], Import[file, "ShapeRecords"],
    ListQ[els] && MemberQ[els, "Records"], Import[file, "Records"],
    True, $Failed
  ]
];

cntyRecs = getRecs["data/tl_2025_us_county.shp"];
rdsRecs  = getRecs["data/tl_2023_us_primaryroads.shp"];
If[cntyRecs === $Failed, Print["ERROR: cannot read counties shapefile"]; Exit[1]];
If[rdsRecs === $Failed, Print["ERROR: cannot read primary roads shapefile"]; Exit[1]];

toAssoc[a_] := If[AssociationQ[a], a, Association@a];
cntyRecs = toAssoc /@ cntyRecs;
rdsRecs  = toAssoc /@ rdsRecs;

getAttr[a_, k_] := Lookup[Lookup[a, "Attributes", <||>], k, Missing[]];
getGeom[a_] := Lookup[a, "Geometry", Missing[]];

rdsEnts = Select[rdsRecs, StringContainsQ[ToString@getAttr[#, "MTFCC"], "S1100"] &];
rdsGeoms = Select[getGeom /@ rdsEnts, # =!= Missing[] &];

distFn[g_] := Module[{d = GeoDistance[g, #] & /@ rdsGeoms}, If[d === {}, Missing["NoRoads"], Min[d]]];

cntyEnts = Select[cntyRecs, getGeom[#] =!= Missing[] &];

cntyGeom = Association@Map[
  With[{a = #, geom = getGeom[#]},
    With[{cen = GeoCenter[geom], d = distFn[GeoCenter[geom]]},
      <|
        "GEOID" -> ToString@getAttr[a, "GEOID"],
        "NAME" -> ToString@getAttr[a, "NAME"],
        "STATEFP" -> ToString@getAttr[a, "STATEFP"],
        "Geometry" -> geom,
        "Centroid" -> cen,
        "DInterstate_km" -> If[Head[d] === Quantity, QuantityMagnitude@UnitConvert[d, "Kilometers"], d]
      |>
    ]
  ] &,
  cntyEnts
];

geomToGeoJSON[g_] := Module[{c = GeoBoundaryCoordinates[g]},
  Which[
    Depth[c] >= 5, <|"type" -> "MultiPolygon", "coordinates" -> c|>,
    Depth[c] == 4, <|"type" -> "Polygon", "coordinates" -> c|>,
    True, <|"type" -> "GeometryCollection", "geometries" -> {}|>
  ]
];

features = Map[
  With[{a = #},
    <|
      "type" -> "Feature",
      "properties" -> <|"GEOID"->a["GEOID"], "NAME"->a["NAME"], "STATEFP"->a["STATEFP"], "DInterstate_km"->a["DInterstate_km"]|>,
      "geometry" -> geomToGeoJSON[a["Geometry"]]
    |>
  ] &,
  Values@cntyGeom
];

Export["outputs/counties.geojson", <|"type"->"FeatureCollection","features"->features|>, "JSON"];
Export["outputs/county_features.mx", cntyGeom];
Print["OK: wrote outputs/counties.geojson and outputs/county_features.mx"];