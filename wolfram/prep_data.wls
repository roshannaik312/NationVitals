SetDirectory[If[StringQ[$InputFileName], DirectoryName[$InputFileName], NotebookDirectory[]]];
If[!DirectoryQ["data"], CreateDirectory["data"]];
If[!DirectoryQ["outputs"], CreateDirectory["outputs"]];

Print["Fetching national public data resources ..."];

ClearAll@getData;
getData[name_] := Module[{d},
  Quiet[
    d = Check[
      ResourceData[name],
      Import["https://datarepository.wolframcloud.com/resources/"<>name, "Dataset"]
    ]
  ];
  If[FailureQ[d] || d === $Failed, Missing["Unavailable"], d]
];

(* --- FIX APPLIED HERE: Replaced custom names with standard Data Repository names --- *)
od   = getData["USCountyDrugOverdoseDeaths"];
su = ResourceData["USSuicideRatesbyCounty"];
mh   = getData["CDCPLACESLocalDataForBetterHealthCountyData"];
acs  = getData["USCountyEconomicData"];
vote = getData["USPresidentialElectionCountyResults"];
(* -------------------------------------------------------------------------------- *)

If[!MissingQ[od],   Export["data/overdose_county_year.csv", od]];
If[!MissingQ[su],   Export["data/suicide_county_year.csv", su]];
If[!MissingQ[mh],   Export["data/mentalhealth_county.csv", mh]];
If[!MissingQ[acs],  Export["data/acs_county_5y.csv", acs]];
If[!MissingQ[vote], Export["data/medsl_county_pres.csv", vote]];

Print["✅ Download complete — available datasets saved in ./data folder"];

normNum[x_] := Quiet@Check[If[NumericQ[x], x, ToExpression@x], Missing[]];

extract = Function[{ds, keep},
  If[MissingQ[ds] || ds === Missing["Unavailable"], {},
    DeleteMissing[Normal@Dataset[ds][All, keep], 1, 2]
  ]
];

odC = extract[od, {"FIPS","Year","Deaths","Population","AgeAdjustedRate"}];
suC = extract[su, {"FIPS","Year","Deaths","Population","AgeAdjustedRate"}];
mhC = extract[mh, {"FIPS","Value"}];
acsC = extract[acs, {"FIPS","Year","PovertyPercent","MedianHouseholdIncome","BachelorsDegreeOrHigherPercent","WhiteAlonePercent","BlackOrAfricanAmericanAlonePercent","HispanicOrLatinoPercent"}];
vtC = extract[vote, {"FIPS","Year","RepublicanShare"}];

toAssoc[list_] := AssociationThread[Range[Length@list] -> list];
{odK,suK,mhK,acsK,vtK} = toAssoc /@ {odC,suC,mhC,acsC,vtC};

key[r_] := StringJoin[ToString@Lookup[r,"FIPS"], "_", ToString@Lookup[r,"Year"]];
indexByKey[list_] := Association@Map[#Key -> # &, Map[Append[#, "Key" -> key[#]] &, list]];

{odK,suK,acsK,vtK} = indexByKey /@ {odC,suC,acsC,vtC};
joinKeys = Intersection[Keys@odK, Keys@suK, Keys@acsK, Keys@vtK];

If[Length[joinKeys] > 0,
  panel = Map[
    With[{o=odK[#], s=suK[#], a=acsK[#], v=vtK[#]},
      <|
        "Key"->#, 
        "FIPS"->Lookup[o,"FIPS"],
        "Year"->Lookup[o,"Year"],
        "OD_Deaths"->normNum@Lookup[o,"Deaths"],
        "OD_Pop"->normNum@Lookup[o,"Population"],
        "OD_Rate"->normNum@Lookup[o,"AgeAdjustedRate"],
        "SU_Deaths"->normNum@Lookup[s,"Deaths"],
        "SU_Pop"->normNum@Lookup[s,"Population"],
        "SU_Rate"->normNum@Lookup[s,"AgeAdjustedRate"],
        "Poverty"->normNum@Lookup[a,"PovertyPercent"],
        "MedHHInc"->normNum@Lookup[a,"MedianHouseholdIncome"],
        "EducBach"->normNum@Lookup[a,"BachelorsDegreeOrHigherPercent"],
        "PctWhite"->normNum@Lookup[a,"WhiteAlonePercent"],
        "PctBlack"->normNum@Lookup[a,"BlackOrAfricanAmericanAlonePercent"],
        "PctHisp"->normNum@Lookup[a,"HispanicOrLatinoPercent"],
        "GOPShare"->normNum@Lookup[v,"RepublicanShare"]
      |>
    ]&,
    joinKeys
  ];
  
  Export["outputs/panel.parquet", panel];
  Export["outputs/panel_preview.csv", panel[[;;Min[500, Length[panel]]]]];
  Print["✅ OK: wrote outputs/panel.parquet and outputs/panel_preview.csv with ", Length[panel], " records"];
,
  Print["⚠️ No data available — no panel files created"];
  Print["Available datasets: ", 
    StringJoin[
      Riffle[
        Select[
          {
            If[!MissingQ[od], "Overdose", Nothing],
            If[!MissingQ[su], "Suicide", Nothing],
            If[!MissingQ[mh], "Mental Health", Nothing],
            If[!MissingQ[acs], "ACS", Nothing],
            If[!MissingQ[vote], "Elections", Nothing]
          },
          True &
        ],
        ", "
      ]
    ]
  ];
];