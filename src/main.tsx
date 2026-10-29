import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Clock,
  Download,
  FileArchive,
  FileText,
  History,
  Layers3,
  MapPin,
  MapPinned,
  Route,
  Scale,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  X,
} from "lucide-react";
import JSZip from "jszip";
import { buildRoadNetwork, offsetEdge, type RoadChainInput, type RoadCurbPiece } from "./roadNetwork";
import { computePoleLayouts, type PoleLayoutResult, type RoadLabelBoxInput } from "./poleLayout";
import { buildGridPagingBoxEntities } from "./gridPaging";
import {
  ProposedNapMapModal,
  type MapPoleItem,
  type MapOverlayLine,
  type HldOverlayPin,
} from "./ProposedNapMapModal";
import { ExcelPicConverter } from "./ExcelPicConverter";
import "./styles.css";

type LonLat = {
  lon: number;
  lat: number;
  alt?: number;
};

type CadPoint = {
  x: number;
  y: number;
  z: number;
};

type Geometry =
  | { type: "Point"; coordinates: LonLat }
  | { type: "LineString"; coordinates: LonLat[] }
  | { type: "Polygon"; coordinates: LonLat[][] };

type Placemark = {
  id: string;
  name: string;
  description: string;
  properties: Record<string, string>;
  geometry: Geometry;
};

export type TelcoProvider = "globe" | "globe_mapsme" | "pldt" | "pldt_legacy";

export function isPldtProvider(provider?: TelcoProvider): boolean {
  return provider === "pldt" || provider === "pldt_legacy";
}

export function isMapsMeProvider(provider?: TelcoProvider): boolean {
  return provider === "globe_mapsme";
}

export function formatProviderLabel(provider?: TelcoProvider): string {
  if (provider === "pldt") return "PLDT / Smart (Structured)";
  if (provider === "pldt_legacy") return "PLDT / Smart (Legacy)";
  if (provider === "globe_mapsme") return "Globe (Maps.me)";
  return "Globe (ISDP)";
}

type LayerName =
  | "0"
  | "EXPOLE"
  | "X-POLE"
  | "X-MERALCO-MANILA"
  | "SPAN"
  | "X-CONVERGE"
  | "X-DITO"
  | "P-POLE 9.14m CC"
  | "POLE PLDT-SMART"
  | "schematic co"
  | "P-POLE"
  | "ELECTRIC POLE"
  | "POLES"
  | "POLE_LABELS"
  | "ROAD_CENTERLINES"
  | "ROAD_LABELS"
  | "ROAD_BOUNDARIES"
  | "RESIDENTIAL_LOTS"
  | "BUILDING_FOOTPRINTS"
  | "RESIDENTIAL_AREAS"
  | "COMMERCIAL_AREAS"
  | "INDUSTRIAL_AREAS"
  | "COMMUNITY_AREAS"
  | "CABLE_ROUTES"
  | "SOURCE_LINES"
  | "SOURCE_POLYGONS"
  | "NAPS"
  | "NAP_LABELS"
  | "NAP_STENCIL"
  | "NAP_COVERAGE"
  | "NAP_PROPOSED"
  | "NAP_VETTED"
  | "NAP_SOURCE"
  | "NAP_DUMMY"
  | "OLT_POI"
  | "CLUSTER_BOUNDARIES"
  | "FEEDER_CABLES"
  | "NEW NAP"
  | "NEW NAP 16-LINES LCP"
  | "NEW NAP 16-LINES NON-LCP"
  | "NEW NAP 8-LINES LCP"
  | "NEW NAP 8-LINES NON-LCP"
  | "EXISTING NAP"
  | "EXISTING NAP 16-LINES"
  | "EXISTING NAP 8-LINES"
  | "DUMMY NAP"
  | "NEW DUMMY NAP"
  | "EXISTING DUMMY NAP"
  | "p-mh"
  | "P-AERIAL_FOC"
  | "CA pole clamp 5-7"
  | "CA pole clamp 7-9"
  | "CA pole clamp 8-10"
  | "CA pole clamp 12-14"
  | "GCA pole clamp 5-7"
  | "GCA pole clamp 7-9"
  | "GCA pole clamp 8-10"
  | "GCA pole clamp 12-14"
  | "SAG"
  | "LOT BOUNDARY"
  | "NAP BOUNDREY"
  | "NAP BOUNDARY"
  | "landmk"
  | "GRID"
  | "t-block"
  | "FTTH_NOTES"
  | (string & {});

type ClassifiedPlacemark = Placemark & {
  layer: LayerName;
  poleId?: string;
};

export type ConverterMode = "pole_survey" | "hld_nap" | "excel_pic";

export type NapStatus = "PROPOSED" | "VETTED" | "SOURCE" | "EXISTING" | "DUMMY";

export type NapSplitter = "1:8" | "1:16" | "1:4" | "2:8" | "2:16" | "1:32";

export type ClassifiedNapPlacemark = Placemark & {
  layer: LayerName;
  napId: string;
  status: NapStatus;
  splitter: NapSplitter;
  ports: number;
  poleRef: string;
  feederRef: string;
  isDummy?: boolean;
};

export type HldNapStandard = {
  telcoProvider: TelcoProvider;
  stencilStyle: "telcoBlock" | "lines8p" | "box8p" | "hex16p" | "splitter" | "circle";
  defaultSplitter: NapSplitter;
  coverageRadiusMeters: number;
  spanAllowanceMeters: number;
  stencilScale: number;
  labelHeight: number;
  includeCoverageCircles: boolean;
  autoGenerateFocCable?: boolean;
  focFiberCount?: string;
};

export const defaultHldNapStandard: HldNapStandard = {
  telcoProvider: "globe",
  stencilStyle: "telcoBlock",
  defaultSplitter: "1:16",
  coverageRadiusMeters: 0,
  spanAllowanceMeters: 0,
  stencilScale: 1.0,
  labelHeight: 1.5,
  includeCoverageCircles: false,
  autoGenerateFocCable: true,
  focFiberCount: "12F",
};

type PoleStandard = {
  markerStyle: "ownerBlock" | "crosshair" | "circle" | "square" | "x";
  markerSize: number;
  labelHeight: number;
  labelOffsetX: number;
  labelOffsetY: number;
  labelTemplate: string;
  electricUtility?: string;
  includeFocCable: boolean;
  includeGridPagingBox: boolean;
  includePoleStencils: boolean;
  includeSpanMeasurements: boolean;
  includeRoads: boolean;
  includeDemandPolygons: boolean;
};

type CoordinateMode =
  | "epsg_4326_lat_lon"
  | "epsg_4326_lon_lat"
  | "mercator"
  | "epsg_3857"
  | "utm"
  | "raw_lon_lat"
  | "raw_lat_lon";
type ExportMode = "original" | "raw_poles";

type ConvertResult = {
  fileName: string;
  kmlNames: string[];
  placemarks: ClassifiedPlacemark[];
  center: LonLat;
  zone: number;
  dxf: string;
  provider: TelcoProvider;
};

export type HldConvertResult = {
  fileName: string;
  kmlNames: string[];
  placemarks: ClassifiedNapPlacemark[];
  naps: ClassifiedNapPlacemark[];
  center: LonLat;
  zone: number;
  dxf: string;
  provider: TelcoProvider;
  projectPrefix?: string;
};

type PoleGeofence = {
  points: CadPoint[];
  path: CadPoint[];
  cableSegments: Array<{ start: CadPoint; end: CadPoint }>;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  bufferMeters: number;
  corridorBufferMeters: number;
  traverseBufferMeters: number;
  poleFallbackMeters: number;
};

type OverpassElement =
  | {
      type: "node";
      id: number;
      lat: number;
      lon: number;
    }
  | {
      type: "way";
      id: number;
      nodes: number[];
      tags?: Record<string, string>;
    };

type OverpassResponse = {
  elements: OverpassElement[];
};

const layerMeta: Record<LayerName, { label: string; color: number }> = {
  "0": { label: "Layer 0 (General)", color: 7 },
  "X-POLE": { label: "Globe Telco poles (PTPOLE)", color: 5 },
  EXPOLE: { label: "Electric/Meralco poles (EPOLE)", color: 7 },
  "X-MERALCO-MANILA": { label: "Electric symbol boundary", color: 5 },
  SPAN: { label: "Span annotations", color: 7 },
  "X-CONVERGE": { label: "Converge poles", color: 7 },
  "X-DITO": { label: "Dito poles", color: 7 },
  PLDT: { label: "PLDT / Smart poles", color: 7 },
  GLOBE: { label: "Globe Telecom poles", color: 5 },
  CONVERGE: { label: "Converge ICT poles", color: 7 },
  DITO: { label: "Dito Telecommunity poles", color: 7 },
  DLPC: { label: "Davao Light & Power (DLPC) poles", color: 7 },
  MERALCO: { label: "Meralco electric poles", color: 7 },
  COTELCO: { label: "Cotabato Electric (COTELCO) poles", color: 7 },
  MORE: { label: "MORE Electric Power poles", color: 7 },
  VECO: { label: "Visayan Electric (VECO) poles", color: 7 },
  "P-POLE 9.14m CC": { label: "Proposed pole markers (P-POLE)", color: 1 },
  "POLE PLDT-SMART": { label: "PLDT / Smart poles (NEW_PLDT_SYSMBOL)", color: 7 },
  "schematic co": { label: "Proposed pole attributes (schematic co)", color: 7 },
  "P-POLE": { label: "Proposed pole markers (NEW_PROPOSE POLE_SYSMBOL)", color: 1 },
  "ELECTRIC POLE": { label: "Electric/Other poles (NEW_ELECTRIC_SYSMBOL)", color: 7 },
  POLES: { label: "Generic pole layer", color: 5 },
  POLE_LABELS: { label: "Pole labels", color: 7 },
  ROAD_CENTERLINES: { label: "OSM road centerlines", color: 8 },
  ROAD_LABELS: { label: "Road labels", color: 2 },
  ROAD_BOUNDARIES: { label: "Road boundaries", color: 7 },
  RESIDENTIAL_LOTS: { label: "Residential lots", color: 8 },
  BUILDING_FOOTPRINTS: { label: "OSM buildings", color: 8 },
  RESIDENTIAL_AREAS: { label: "OSM residential areas", color: 9 },
  COMMERCIAL_AREAS: { label: "OSM commercial/retail areas", color: 2 },
  INDUSTRIAL_AREAS: { label: "OSM industrial/warehouse areas", color: 1 },
  COMMUNITY_AREAS: { label: "OSM community/institution areas", color: 4 },
  CABLE_ROUTES: { label: "Cable routes", color: 6 },
  SOURCE_LINES: { label: "Other source lines", color: 8 },
  SOURCE_POLYGONS: { label: "Other source polygons", color: 9 },
  NAPS: { label: "Network Access Points (NAP)", color: 4 },
  NAP_LABELS: { label: "NAP Identification Labels", color: 2 },
  NAP_STENCIL: { label: "NAP Stencil Symbols & Mounting", color: 3 },
  NAP_COVERAGE: { label: "NAP 150m Drop Coverage Boundary", color: 8 },
  NAP_PROPOSED: { label: "Proposed NAP Locations", color: 1 },
  NAP_VETTED: { label: "Vetted NAP Locations", color: 4 },
  NAP_SOURCE: { label: "Source / Existing NAPs", color: 5 },
  NAP_DUMMY: { label: "Dummy / Reserve NAPs", color: 6 },
  "DUMMY NAP": { label: "Globe Dummy NAP Stencil & Labels", color: 1 },
  "NEW DUMMY NAP": { label: "Globe Proposed Dummy NAP", color: 1 },
  "EXISTING DUMMY NAP": { label: "Globe Existing Dummy NAP", color: 5 },
  OLT_POI: { label: "OLT / POI / Closures", color: 5 },
  CLUSTER_BOUNDARIES: { label: "Cluster Boundaries", color: 8 },
  FEEDER_CABLES: { label: "Feeder / Distribution Cables", color: 6 },
  "NEW NAP": { label: "Globe Proposed NAP Stencil", color: 1 },
  "NEW NAP 16-LINES LCP": { label: "Globe Proposed 16-Lines LCP NAP (N01)", color: 1 },
  "NEW NAP 16-LINES NON-LCP": { label: "Globe Proposed 16-Lines Non-LCP NAP (N02-N04)", color: 1 },
  "NEW NAP 8-LINES LCP": { label: "Globe Proposed 8-Lines LCP NAP (N01)", color: 1 },
  "NEW NAP 8-LINES NON-LCP": { label: "Globe Proposed 8-Lines Non-LCP NAP (N02-N04)", color: 1 },
  "EXISTING NAP": { label: "Globe Existing NAP Stencil & Labels", color: 5 },
  "EXISTING NAP 16-LINES": { label: "Globe Existing 16-Lines Source NAP", color: 5 },
  "EXISTING NAP 8-LINES": { label: "Globe Existing 8-Lines Source NAP", color: 5 },
  "p-mh": { label: "Globe Proposed NAP Labels (MHTYPE/MHNO)", color: 1 },
  "P-AERIAL_FOC": { label: "Globe Aerial FOC & Dummy NAP", color: 1 },
  "CA pole clamp 5-7": { label: "CA Clamp 5-7 Straight (VS2)", color: 3 },
  "CA pole clamp 7-9": { label: "CA Clamp 7-9 Straight (S2)", color: 3 },
  "CA pole clamp 8-10": { label: "CA Clamp 8-10 Straight (B2)", color: 3 },
  "CA pole clamp 12-14": { label: "CA Clamp 12-14 Straight (VB2)", color: 3 },
  "GCA pole clamp 5-7": { label: "GCA Clamp 5-7 Curve/Corner (VS3)", color: 6 },
  "GCA pole clamp 7-9": { label: "GCA Clamp 7-9 Curve/Corner (S3)", color: 6 },
  "GCA pole clamp 8-10": { label: "GCA Clamp 8-10 Curve/Corner (B3)", color: 6 },
  "GCA pole clamp 12-14": { label: "GCA Clamp 12-14 Curve/Corner (VB3)", color: 6 },
  SAG: { label: "Pole Clamp Header (SAG)", color: 6 },
  "LOT BOUNDARY": { label: "Pole Clamp Outer Box (LOT BOUNDARY)", color: 8 },
  "NAP BOUNDREY": { label: "Pole Clamp Inner Box (NAP BOUNDREY)", color: 1 },
  "NAP BOUNDARY": { label: "Proposed NAP Serving Area Boundary (NAP BOUNDARY)", color: 5 },
  landmk: { label: "Residential Lot Grid & Labels (RES)", color: 251 },
  GRID: { label: "Paging Grid Boxes (GRID)", color: 4 },
  "t-block": { label: "Paging Grid Page Numbers (t-block)", color: 7 },
  FTTH_NOTES: { label: "Template notes", color: 2 },
};

export const electricCoopAliases: Record<string, string> = {
  "davao light": "DLPC",
  "davao light & power": "DLPC",
  "davao light and power": "DLPC",
  "dlpc": "DLPC",
  "cotabato light": "CLPC",
  "clpc": "CLPC",
  "visayan electric": "VECO",
  "veco": "VECO",
  "more power": "MORE",
  "more": "MORE",
  "nordeco": "DANECO",
  "daneco": "DANECO",
  "meralco": "MERALCO",
  "cotelco": "COTELCO",
  "socoteco": "SOCOTECO",
  "moelci": "MOELCI",
  "aneco": "ANECO",
  "aselco": "ASELCO",
  "noreco": "NORECO",
  "leyeco": "LEYECO",
  "samelco": "SAMELCO",
  "pelco": "PELCO",
  "ileco": "ILECO",
  "beneco": "BENECO",
  "cepalco": "CEPALCO",
  "panelco": "PANELCO",
  "neeco": "NEECO",
  "zameco": "ZAMECO",
  "fleco": "FLECO",
  "batelec": "BATELEC",
  "casureco": "CASURECO",
  "canoreco": "CANORECO",
  "aleco": "ALECO",
  "maselco": "MASELCO",
  "tielco": "TIELCO",
  "ormeco": "ORMECO",
  "omeco": "OMECO",
  "paleco": "PALECO",
  "akelco": "AKELCO",
  "capelco": "CAPELCO",
  "cenpelco": "CENPELCO",
  "anteco": "ANTECO",
  "cebeco": "CEBECO",
  "boheco": "BOHECO",
  "norsamelco": "NORSAMELCO",
  "esamelco": "ESAMELCO",
  "zaneco": "ZANECO",
  "zamsureco": "ZAMSURECO",
  "zamcelco": "ZAMCELCO",
  "moresco": "MORESCO",
  "fibeco": "FIBECO",
  "buseco": "BUSECO",
  "laneco": "LANECO",
  "dorelco": "DORELCO",
  "dasureco": "DASURECO",
  "sukelco": "SUKELCO",
};

export const telcoAliases: Record<string, string> = {
  "pldt": "PLDT",
  "smart": "PLDT",
  "globe": "GLOBE",
  "innove": "GLOBE",
  "converge": "CONVERGE",
  "ict": "CONVERGE",
  "dito": "DITO",
  "telof": "TELOF",
  "etpi": "ETPI",
};

export function getLayerColor(layer: string): number {
  if (layerMeta[layer as keyof typeof layerMeta]) {
    return layerMeta[layer as keyof typeof layerMeta].color;
  }
  const upper = layer.toUpperCase();
  if (upper.includes("PROPOSE") || upper.startsWith("P-") || upper === "P-POLE") return 1;
  if (upper.includes("GLOBE") || upper.includes("INNOVE")) return 5;
  return 7;
}

const poleKeywords = ["pole", "poles", "post", "utility", "span", "nap", "fdh"];
const roadKeywords = ["road", "street", "row", "r.o.w", "boundary", "carriage", "centerline"];
const lotKeywords = ["lot", "parcel", "residential", "house", "property", "subdivision"];
const cableKeywords = ["fiber", "fibre", "cable", "drop", "feeder", "distribution", "route", "duct", "foc", "ofc", "aerial", "arial", "span"];

const defaultPoleStandard: PoleStandard = {
  markerStyle: "ownerBlock",
  markerSize: 1,
  labelHeight: 1.5,
  labelOffsetX: 2.2,
  labelOffsetY: 0.8,
  labelTemplate: "{poleNo}\n{poleType}\n{longitude},{latitude}",
  electricUtility: "AUTO",
  includeFocCable: true,
  includeGridPagingBox: false,
  includePoleStencils: true,
  includeSpanMeasurements: true,
  includeRoads: true,
  includeDemandPolygons: true,
};

const rawCoordinatePoleStandard: PoleStandard = {
  ...defaultPoleStandard,
  markerSize: 0.000008,
  labelHeight: 0.000015,
  labelOffsetX: 0.000018,
  labelOffsetY: 0.000006,
};

const rawPoleMetricStandard: PoleStandard = {
  ...defaultPoleStandard,
  markerStyle: "ownerBlock",
  labelTemplate: "{poleTag}\n{rawPoleType}\n{latitude},{longitude}",
};

export type RoadCategory =
  | "motorway"
  | "national_highway"
  | "secondary_arterial"
  | "tertiary_collector"
  | "residential_street"
  | "barangay_road"
  | "interior_alley";

export type RoadWidthStandard = {
  motorwayWidth: number;
  nationalHighwayWidth: number;
  secondaryWidth: number;
  tertiaryWidth: number;
  residentialWidth: number;
  barangayWidth: number;
  alleyWidth: number;
};

export const defaultRoadWidthStandard: RoadWidthStandard = {
  motorwayWidth: 28.0,
  nationalHighwayWidth: 20.0,
  secondaryWidth: 12.0,
  tertiaryWidth: 9.0,
  residentialWidth: 6.0,
  barangayWidth: 5.0,
  alleyWidth: 3.0,
};

export type CableSpanStandard = {
  allowanceMeters: number;
  textHeight: number;
  roadInsetOffset: number;
};

export const defaultCableSpanStandard: CableSpanStandard = {
  allowanceMeters: 2.0,
  textHeight: 1.4,
  roadInsetOffset: 3.5,
};

function textOf(node: Element, tagName: string) {
  return node.getElementsByTagName(tagName)[0]?.textContent?.trim() ?? "";
}

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function hasAny(value: string, keywords: string[]) {
  const target = normalize(value);
  return keywords.some((keyword) => target.includes(keyword));
}

function parseCoordinates(value: string): LonLat[] {
  return value
    .trim()
    .split(/\s+/)
    .map<LonLat | null>((chunk) => {
      const [lon, lat, alt] = chunk.split(",").map(Number);
      return Number.isFinite(lon) && Number.isFinite(lat)
        ? { lon, lat, alt: Number.isFinite(alt) ? alt : undefined }
        : null;
    })
    .filter((point): point is LonLat => point !== null);
}

function extractProperties(placemark: Element) {
  const properties: Record<string, string> = {};
  Array.from(placemark.getElementsByTagName("Data")).forEach((data) => {
    const key = data.getAttribute("name");
    const value = textOf(data, "value");
    if (key && value) properties[key] = value;
  });
  Array.from(placemark.getElementsByTagName("SimpleData")).forEach((data) => {
    const key = data.getAttribute("name");
    const value = data.textContent?.trim();
    if (key && value) properties[key] = value;
  });

  // Extract structured HTML <table> key-value pairs from <description> (e.g. PLDT FTTH Survey structured KMZ)
  const desc = textOf(placemark, "description");
  if (desc && /<td\b/i.test(desc)) {
    const rowRegex = /<tr[^>]*>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi;
    let match: RegExpExecArray | null;
    while ((match = rowRegex.exec(desc)) !== null) {
      const rawKey = match[1]
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/gi, " ")
        .replace(/:+\s*$/, "")
        .trim();
      const rawVal = match[2]
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/gi, " ")
        .trim();
      if (rawKey && rawVal && !(rawKey in properties)) {
        properties[rawKey] = rawVal;
      }
    }
  }

  const styleUrl = textOf(placemark, "styleUrl");
  if (styleUrl) {
    properties._styleUrl = styleUrl;
  }

  if (
    placemark.getElementsByTagName("mwm:name").length > 0 ||
    placemark.getElementsByTagName("mwm:customName").length > 0 ||
    placemark.getElementsByTagName("mwm:lastModified").length > 0
  ) {
    properties._mwm = "true";
  }

  return properties;
}

/** Field apps (MAPS.ME / Organic Maps / Earth exports) often emit prefixed tags without xmlns. */
function sanitizeKmlXml(kmlText: string): string {
  const missingNamespaces: Array<[prefix: string, uri: string]> = [
    ["mwm", "https://maps.me"],
    ["gx", "http://www.google.com/kml/ext/2.2"],
    ["atom", "http://www.w3.org/2005/Atom"],
  ];

  let text = kmlText;
  for (const [prefix, uri] of missingNamespaces) {
    const used = new RegExp(`<${prefix}:`, "i").test(text);
    const declared = new RegExp(`xmlns:${prefix}\\s*=`, "i").test(text);
    if (used && !declared) {
      text = text.replace(/<kml\b([^>]*)>/i, `<kml$1 xmlns:${prefix}="${uri}">`);
    }
  }
  return text;
}

function parseKml(kmlText: string): Placemark[] {
  const doc = new DOMParser().parseFromString(sanitizeKmlXml(kmlText), "application/xml");
  const parseError = doc.getElementsByTagName("parsererror")[0];
  if (parseError) {
    throw new Error("The selected file contains invalid KML XML.");
  }

  const isMwmDoc = /<mwm:/i.test(kmlText);
  const placemarks: Placemark[] = [];
  Array.from(doc.getElementsByTagName("Placemark")).forEach((placemark, index) => {
    const name =
      textOf(placemark, "name") ||
      textOf(placemark, "mwm:customName") ||
      textOf(placemark, "mwm:name") ||
      `Placemark ${index + 1}`;
    const description = textOf(placemark, "description") || textOf(placemark, "mwm:description");
    const properties = extractProperties(placemark);
    if (isMwmDoc) {
      properties._mwm = "true";
    }

    let folderName = "";
    const folderChain: string[] = [];
    let parent = placemark.parentElement;
    while (parent) {
      if (parent.tagName.toLowerCase().endsWith("folder")) {
        const fn = textOf(parent, "name");
        if (fn) {
          if (!folderName) folderName = fn;
          folderChain.push(fn);
        }
      }
      parent = parent.parentElement;
    }
    if (folderName) {
      properties._folder = folderName;
      properties.Folder = folderName;
      properties._folderChain = folderChain.slice().reverse().join(" / ");
    }

    const id = placemark.getAttribute("id") || `${name}-${index}`;

    const points = Array.from(placemark.getElementsByTagName("Point"));
    const lines = Array.from(placemark.getElementsByTagName("LineString"));
    const polygons = Array.from(placemark.getElementsByTagName("Polygon"));

    if (lines.length > 0) {
      lines.forEach((lineEl, lIdx) => {
        const coordinates = parseCoordinates(textOf(lineEl, "coordinates"));
        if (coordinates.length > 1) {
          placemarks.push({
            id: lines.length > 1 ? `${id}-line-${lIdx}` : id,
            name: lines.length > 1 ? `${name} (Line ${lIdx + 1})` : name,
            description,
            properties,
            geometry: { type: "LineString", coordinates },
          });
        }
      });
    }

    if (points.length > 0) {
      points.forEach((pointEl, pIdx) => {
        const coordinates = parseCoordinates(textOf(pointEl, "coordinates"))[0];
        if (coordinates) {
          placemarks.push({
            id: points.length > 1 ? `${id}-pt-${pIdx}` : id,
            name: points.length > 1 ? `${name} (Point ${pIdx + 1})` : name,
            description,
            properties,
            geometry: { type: "Point", coordinates },
          });
        }
      });
    }

    if (polygons.length > 0) {
      polygons.forEach((polygonEl, polyIdx) => {
        const rings = Array.from(polygonEl.getElementsByTagName("LinearRing"))
          .map((ring) => parseCoordinates(textOf(ring, "coordinates")))
          .filter((ring) => ring.length > 2);
        if (rings.length) {
          placemarks.push({
            id: polygons.length > 1 ? `${id}-poly-${polyIdx}` : id,
            name: polygons.length > 1 ? `${name} (Area ${polyIdx + 1})` : name,
            description,
            properties,
            geometry: { type: "Polygon", coordinates: rings },
          });
        }
      });
    }
  });

  return placemarks;
}

export type MapsMePoleComponents = {
  kind: "PROPOSED" | "TELCO" | "ELECTRIC";
  owner: string;
  poleCode: string;
  poleNo: string;
  poleType: "CC" | "ST" | "WO";
  poleHeight: string;
};

function mapMapsMeMaterial(mat?: string): "CC" | "ST" | "WO" {
  if (!mat) return "CC";
  const l = mat.toLowerCase();
  if (l.startsWith("w")) return "WO";
  if (l.startsWith("s") || l === "gi" || l === "me") return "ST";
  return "CC";
}

export function looksLikeMapsMePoleName(name: string): boolean {
  const rawName = (name || "").trim();
  if (!rawName) return false;
  if (/^p(?:rop(?:osed)?)?[-_\s]*(?:7(?:\.5)?|8|9(?:\.14)?|10|11|12)m?(?:[-_\s]*(?:cc|st|wd|wo|wp|gi))?(?:\b|$)/i.test(rawName)) {
    return true;
  }
  if (/^(?:globe|innove|pldt|smart|converge|conv|dito|etpi|telof|gt|gl|pt|ic|cv)(?:[-_\s]+|(?=(?:npt?|\d)))(.+)$/i.test(rawName)) {
    return true;
  }
  if (/^(?:[A-Za-z0-9\-_]+?)[-_\s]*(?:(?:cc|st|wd|wo|wp|gi|sc)[-_\s]*(?:7(?:\.5)?|8|9(?:\.14)?|10|11|12|13|14)?m?|(?:s|w)[-_\s]*(?:7(?:\.5)?|8|9(?:\.14)?|10|11|12|13|14)m?)(?:\b|$)/i.test(rawName)) {
    return true;
  }
  if (/^(?:ep[-_\s]*)?npt?(?:[-_\s]*(?:7(?:\.5)?|8|9(?:\.14)?|10|11|12|13|14)m?)?$/i.test(rawName)) {
    return true;
  }
  if (/^\d{4,10}$/.test(rawName)) {
    return true;
  }
  return false;
}

export function parseMapsMePoleComponents(placemarkOrName: Placemark | string): MapsMePoleComponents {
  const rawName = (typeof placemarkOrName === "string" ? placemarkOrName : placemarkOrName.name || "").trim();

  // 1. Proposed Pole (e.g., "p7", "p9", "P9 proposed 72F closure", "p-7", "p7cc")
  const propMatch = rawName.match(
    /^p(?:rop(?:osed)?)?[-_\s]*(7(?:\.5)?|8|9(?:\.14)?|10|11|12)m?(?:[-_\s]*(cc|st|wd|wo|wp|gi))?(?:\b|$)/i,
  );
  if (propMatch) {
    const hToken = propMatch[1];
    const poleHeight = hToken.startsWith("7")
      ? "7.5m"
      : hToken.startsWith("8")
        ? "8.0m"
        : hToken.startsWith("9")
          ? "9.0m"
          : `${hToken}.0m`;
    return {
      kind: "PROPOSED",
      owner: "PROPOSED",
      poleCode: "G",
      poleNo: "PROPOSED POLE",
      poleType: mapMapsMeMaterial(propMatch[2]),
      poleHeight,
    };
  }

  // 2. Telco Pole (e.g., "ptnptcc9", "ptnptcc7", "Globenpt9", "pt12345cc9", "gtnptcc9")
  const telcoMatch = rawName.match(
    /^(globe|innove|pldt|smart|converge|conv|dito|etpi|telof|gt|gl|pt|ic|cv)(?:[-_\s]+|(?=(?:npt?|\d)))(.+)$/i,
  );
  if (telcoMatch) {
    const rawPrefix = telcoMatch[1].toLowerCase();
    let rem = telcoMatch[2].trim();
    let owner = "GLOBE";
    let prefix = "GT";
    let poleCode = "G";
    if (rawPrefix === "pt" || rawPrefix === "pldt" || rawPrefix === "smart") {
      owner = "PLDT";
      prefix = "PT";
      poleCode = "P";
    } else if (rawPrefix === "ic" || rawPrefix === "innove") {
      owner = "INNOVE";
      prefix = "IC";
      poleCode = "I";
    } else if (rawPrefix === "cv" || rawPrefix === "conv" || rawPrefix === "converge") {
      owner = "CONVERGE";
      prefix = "C";
      poleCode = "C";
    } else if (rawPrefix === "dito") {
      owner = "DITO";
      prefix = "DITO";
      poleCode = "D";
    } else if (rawPrefix === "etpi") {
      owner = "ETPI";
      prefix = "ETPI";
      poleCode = "E";
    } else if (rawPrefix === "telof") {
      owner = "TELOF";
      prefix = "TELOF";
      poleCode = "T";
    }

    let poleType: "CC" | "ST" | "WO" = "CC";
    const tailMatch = rem.match(
      /^([A-Za-z0-9\-_]+?)[-_\s]*(?:(cc|st|wd|wo|wp|gi|sc)[-_\s]*(7(?:\.5)?|8|9(?:\.14)?|10|11|12|13|14)?m?|(s|w)[-_\s]*(7(?:\.5)?|8|9(?:\.14)?|10|11|12|13|14)m?)(?:\b|$)/i,
    );
    if (tailMatch && tailMatch[1]) {
      rem = tailMatch[1].trim();
      poleType = mapMapsMeMaterial(tailMatch[2] || tailMatch[4]);
    } else {
      const nptHeight = rem.match(/^(npt?)[-_\s]*(7(?:\.5)?|8|9(?:\.14)?|10|11|12|13|14)m?(?:\b|$)/i);
      if (nptHeight) {
        rem = "NPT";
      } else {
        rem = rem.split(/\s+/)[0] || "NPT";
      }
    }
    const tag = !rem || /^npt?$/i.test(rem) ? "NPT" : rem.toUpperCase();
    return {
      kind: "TELCO",
      owner,
      poleCode,
      poleNo: `${prefix} - ${tag}`,
      poleType,
      poleHeight: "9.0m",
    };
  }

  // 3. Electric Pole (e.g., "1202751cc9", "nptst9", "npst11", "1202765s11", "1202771wd9", "12027XXst9", "XXXXX42wd9", "1202576")
  let tagRaw = rawName;
  let poleType: "CC" | "ST" | "WO" = "CC";
  const elecMatch = rawName.match(
    /^([A-Za-z0-9\-_]+?)[-_\s]*(?:(cc|st|wd|wo|wp|gi|sc)[-_\s]*(7(?:\.5)?|8|9(?:\.14)?|10|11|12|13|14)?m?|(s|w)[-_\s]*(7(?:\.5)?|8|9(?:\.14)?|10|11|12|13|14)m?)(?:\b|$)/i,
  );
  if (elecMatch && elecMatch[1]) {
    tagRaw = elecMatch[1].trim();
    poleType = mapMapsMeMaterial(elecMatch[2] || elecMatch[4]);
  } else {
    const nptHeight = rawName.match(/^(?:ep[-_\s]*)?(npt?)[-_\s]*(7(?:\.5)?|8|9(?:\.14)?|10|11|12|13|14)m?(?:\b|$)/i);
    if (nptHeight) {
      tagRaw = "NPT";
    } else {
      tagRaw = rawName.split(/\s+/)[0] || "NPT";
    }
  }
  const poleNo = /^(?:ep[-_\s]*)?npt?$/i.test(tagRaw) ? "NPT" : tagRaw.toUpperCase();
  return {
    kind: "ELECTRIC",
    owner: "ELECTRIC",
    poleCode: "G",
    poleNo,
    poleType,
    poleHeight: "9.0m",
  };
}

function hasPtIdentification(placemark: Placemark): boolean {
  if (placemark.properties?._mapsMeKind) {
    return placemark.properties._mapsMeKind === "TELCO" && placemark.properties._mapsMeOwner === "PLDT";
  }
  const explicitOwner = normalize(
    findProperty(placemark.properties, ["owner", "provider", "company", "telco", "pole owner", "pole_owner", "classification"]),
  );
  if (explicitOwner.includes("pldt") || explicitOwner.includes("smart") || explicitOwner === "pt") {
    return true;
  }
  if (
    explicitOwner.includes("elec") ||
    explicitOwner.includes("meralco") ||
    explicitOwner.includes("coop") ||
    explicitOwner.includes("power") ||
    explicitOwner.includes("utility") ||
    explicitOwner.includes("dlpc") ||
    explicitOwner.includes("cotelco") ||
    explicitOwner.includes("veco") ||
    explicitOwner.includes("more")
  ) {
    return false;
  }
  const name = (placemark.name || "").trim();
  if (/^(?:elec|electric|meralco|coop|epole)\s*[•·\-_:]/i.test(name)) {
    return false;
  }
  const tag = normalize(findProperty(placemark.properties, ["pole tag #", "pole tag", "pole_tag", "tag", "pole no", "pole_no", "code", "pole id", "pole_id"]));
  if (/\bpt\b|^pt[-_\s0-9]|^pt(?:npt|cc|wp|wo|st|gi|sc)/i.test(tag)) {
    return true;
  }
  if (/\bpt\b|^pt[-_\s0-9]|^pt(?:npt|cc|wp|wo|st|gi|sc)|\bpldt\b|\bsmart\b/i.test(name)) {
    return true;
  }
  const desc = (placemark.description || "").replace(/<[^>]+>/g, " ").trim();
  if (/\bpt\b|^pt[-_\s0-9]|^pt(?:npt|cc|wp|wo|st|gi|sc)|\bpldt\b|\bsmart\b/i.test(desc)) {
    return true;
  }
  return false;
}

function classifyPlacemark(
  placemark: Placemark,
  provider: TelcoProvider = "globe",
  electricUtility = "AUTO",
): ClassifiedPlacemark {
  const searchable = [
    placemark.name,
    placemark.description,
    ...Object.keys(placemark.properties),
    ...Object.values(placemark.properties),
  ].join(" ");

  const poleId =
    placemark.properties.PoleID ||
    placemark.properties.pole_id ||
    placemark.properties.POLE_ID ||
    placemark.properties.Name ||
    placemark.name;

  if (placemark.geometry.type === "Point") {
    let workingPlacemark = placemark;
    if (provider === "globe_mapsme") {
      const mm = parseMapsMePoleComponents(placemark);
      workingPlacemark = {
        ...placemark,
        properties: {
          ...placemark.properties,
          _mapsMe: "true",
          _mapsMeKind: mm.kind,
          _mapsMeOwner: mm.owner,
          _mapsMePoleCode: mm.poleCode,
          _mapsMePoleNo: mm.poleNo,
          _mapsMePoleType: mm.poleType,
          _mapsMePoleHeight: mm.poleHeight,
        },
      };
    } else if (placemark.properties._mapsMe) {
      const nextProps = { ...placemark.properties };
      delete nextProps._mapsMe;
      delete nextProps._mapsMeKind;
      delete nextProps._mapsMeOwner;
      delete nextProps._mapsMePoleCode;
      delete nextProps._mapsMePoleNo;
      delete nextProps._mapsMePoleType;
      delete nextProps._mapsMePoleHeight;
      workingPlacemark = { ...placemark, properties: nextProps };
    }
    const layer = determinePoleLayer(workingPlacemark, provider, electricUtility);
    return { ...workingPlacemark, layer, poleId };
  }

  const folder = placemark.properties.Folder || placemark.properties._folder || "";
  if (
    placemark.geometry.type === "LineString" &&
    (/\bspan\b|\bcable\b|\bofcs?\b|\bfoc\b|\baerial\b/i.test(placemark.name) ||
      /\bspan\b|\bcable\b|\broute\b/i.test(folder))
  ) {
    return { ...placemark, layer: "CABLE_ROUTES" };
  }

  if (hasAny(searchable, roadKeywords)) return { ...placemark, layer: "ROAD_BOUNDARIES" };
  if (hasAny(searchable, lotKeywords)) return { ...placemark, layer: "RESIDENTIAL_LOTS" };
  if (hasAny(searchable, cableKeywords)) return { ...placemark, layer: "CABLE_ROUTES" };
  if (hasAny(searchable, poleKeywords)) return { ...placemark, layer: "CABLE_ROUTES" };

  if (placemark.geometry.type === "LineString") {
    return { ...placemark, layer: "CABLE_ROUTES" };
  }

  return {
    ...placemark,
    layer: placemark.geometry.type === "Polygon" ? "SOURCE_POLYGONS" : "SOURCE_LINES",
  };
}

const napKeywords = ["nap", "fat", "fdp", "splitter", "odn", "fdt", "access point", "terminal"];
const feederKeywords = ["feeder", "distribution", "foc", "fiber", "fibre", "cable", "ofc", "aerial", "arial", "span", "loop"];

export function isProposedNapFolder(folderName: string): boolean {
  if (!folderName) return false;
  const norm = normalize(folderName);
  if (isDummyNapFolder(folderName) || hasExistingNapIdentifier(folderName)) return false;
  return (
    norm.includes("proposed nap") ||
    norm.includes("prop nap") ||
    norm.includes("prop_nap") ||
    norm.includes("p-nap") ||
    norm.includes("pnap") ||
    norm.includes("proposed_nap") ||
    norm.includes("new nap") ||
    norm.includes("new_nap") ||
    norm === "proposed" ||
    norm.startsWith("proposed ") ||
    norm.endsWith(" proposed") ||
    (norm.includes("proposed") && (norm.includes("nap") || norm.includes("fat") || norm.includes("fdp") || norm.includes("splitter") || !norm.includes("pole")))
  );
}

export function isDummyNapFolder(folderName: string): boolean {
  const norm = normalize(folderName);
  return (
    norm.includes("dummy nap") ||
    norm.includes("dummy_nap") ||
    norm.includes("d-nap") ||
    norm.includes("dnap") ||
    norm.includes("dummy")
  );
}

export function hasExistingNapIdentifier(str: string): boolean {
  if (!str) return false;
  return (
    /\b(?:EXISTING[_\-\s]*NAP|EX[\-_]?NAP)\b/i.test(str) ||
    /\bEXISTING\b/i.test(str) ||
    /\bSOURCE[_\-\s]*EXISTING\b/i.test(str) ||
    hasBatchIdentifier(str)
  );
}

export function hasBatchIdentifier(str: string): boolean {
  if (!str) return false;
  return /\b(?:BATCH[_\-\s]*\d+|B\d+)\b/i.test(str) || /\bBATCH\b/i.test(str);
}

export function stripBatchIdentifier(str: string): string {
  return str
    .replace(/\s*\((?:BATCH[_\-\s]*\d+|B\d+)[^\)]*\)/gi, "")
    .replace(/\s*\([^\)]*BATCH[^\)]*\)/gi, "")
    .replace(/\s*\([^\)]*EXISTING[^\)]*\)/gi, "")
    .replace(/\s*\([^\)]*SOURCE[^\)]*\)/gi, "")
    .replace(/\s*[\-_]?\s*(?:BATCH[_\-\s]*\d+|B\d+)\b.*$/i, "")
    .replace(/\s*[\-_]?\s*(?:EXISTING[_\-\s]*NAP|EX[\-_]?NAP)\b.*$/i, "")
    .trim();
}

export function isDummyNapIdentifier(name: string, folder = ""): boolean {
  if (isDummyNapFolder(folder)) return true;
  const clean = stripBatchIdentifier(name).trim();
  // Globe FTTH standard: Dummy NAPs are always C0X_D0X (e.g. MIN4026_C01_D01, CRA_001_C02_D02, C01_D01, D01, D1)
  // while standard NAPs are always LXXX_N0X (e.g. MIN167_L911_N04, CRA_001_L907_N01)
  return (
    /C\d{1,3}[_\-\s]*D\d{1,3}\b/i.test(clean) ||
    /^(?:D\d+|DUMMY[_\-\s]*\d+)\b/i.test(clean) ||
    /(?:^|[_\-\s])D\d{1,3}(?:$|[_\-\s])/i.test(clean) ||
    /\b(?:DUMMY|D-NAP|DNAP)\b/i.test(clean)
  );
}

export function isStandardNapIdentifier(name: string): boolean {
  const clean = stripBatchIdentifier(name).trim();
  // Standard Globe / Telco NAP identifiers:
  // e.g. CRA_001_L907_N01, MIN167_L911_N04, MIN5_L910_N01, L907_N01, N01, NAP-01, FAT-01
  return (
    /L\d{1,4}[_\-\s]*N\d{1,3}\b/i.test(clean) ||
    /(?:^|[_\-\s])N\d{2,3}(?:$|[_\-\s])/i.test(clean) ||
    /\b(?:NAP|FAT|FDP|FDT|TCR)[_\-\s]*\d+/i.test(clean)
  );
}

export function isNapEntity(name: string, folder = ""): boolean {
  if (hasExistingNapIdentifier(name) || hasExistingNapIdentifier(folder)) return true;
  if (hasBatchIdentifier(name) || hasBatchIdentifier(folder)) return true;
  if (isDummyNapIdentifier(name, folder)) return true;
  if (isStandardNapIdentifier(name)) return true;
  if (isProposedNapFolder(folder) || isDummyNapFolder(folder)) return true;
  const clean = normalize(stripBatchIdentifier(name));
  return clean.includes("nap") || clean.includes("fat") || clean.includes("fdp");
}

export function isPolePlacemark(placemark: Placemark, folderName = ""): boolean {
  if (isNapEntity(placemark.name, folderName)) return false;
  const searchable = `${placemark.name || ""} ${folderName} ${Object.values(placemark.properties || {}).join(" ")}`.toLowerCase();
  if (/\b(?:pole|expo|mfg|meralco|dlpc|davao\s*light|cotabato\s*light|veco)\b/i.test(searchable)) return true;
  if (/^(?:p|pl|pt)[_\-\s]*\d+/i.test(placemark.name.trim())) return true;
  if (placemark.properties?.pole_id || placemark.properties?.PoleID || placemark.properties?.POLE_ID || placemark.properties?.pole_tag) return true;
  return false;
}

export function detectNapStatus(searchable: string, folderName = ""): NapStatus {
  const folderNorm = normalize(folderName);
  const searchNorm = normalize(searchable);

  // 1. Existing or Batch identifier indicates physically existing NAP (Source Existing NAP)
  if (hasExistingNapIdentifier(searchable) || hasExistingNapIdentifier(folderName) || searchNorm.includes("exist") || folderNorm.includes("exist")) {
    return "EXISTING";
  }

  // 2. Explicit Dummy NAP folder
  if (isDummyNapFolder(folderName)) {
    return "DUMMY";
  }

  // 3. Explicit Proposed NAP folder
  if (isProposedNapFolder(folderName)) {
    if (isDummyNapIdentifier(searchable, folderName)) {
      return "DUMMY";
    }
    return "PROPOSED";
  }

  // 4. Existing (explicit keywords)
  if (folderNorm.includes("exist") || searchNorm.includes("ex-nap") || searchNorm.includes("ex nap")) {
    return "EXISTING";
  }

  // 5. Dummy naming (C0X_D0X)
  if (isDummyNapIdentifier(searchable, folderName)) {
    return "DUMMY";
  }

  // 6. Standard NAP naming (LXXX_N0X)
  if (isStandardNapIdentifier(searchable)) {
    return "PROPOSED";
  }

  // 7. OLT / POI / Closures / Source (only when not a NAP)
  if (
    folderNorm.includes("olt") ||
    folderNorm.includes("poi") ||
    folderNorm.includes("closure") ||
    folderNorm.includes("source") ||
    folderNorm.includes("src nap") ||
    folderNorm.includes("fdh") ||
    folderNorm.includes("fdt") ||
    searchNorm.includes("olt") ||
    searchNorm.includes("poi") ||
    searchNorm.includes("closure")
  ) {
    return "SOURCE";
  }

  // 8. Vetted
  if (folderNorm.includes("vetted") || searchNorm.includes("vt nap") || searchNorm.includes("v-nap")) {
    return "VETTED";
  }

  if (folderName.trim()) {
    return "SOURCE";
  }

  // Fallback for flat KML files without any folder structure
  if (isDummyNapIdentifier(searchable, folderName) || searchNorm.includes("dummy") || /^(?:d\d+|dummy[_\-\s]*\d+)/i.test(searchable.trim())) {
    return "DUMMY";
  }
  if (searchNorm.includes("nap") || searchNorm.includes("fat") || searchNorm.includes("fdp")) {
    return "PROPOSED";
  }
  return "SOURCE";
}

export function detectNapSplitter(searchable: string, defaultSplitter: NapSplitter = "1:16"): NapSplitter {
  const clean = searchable.replace(/_/g, " ");
  const norm = normalize(clean);

  // 1. Explicit 8-lines / 1:8 / 8-port checks (checks both raw string and with spaces/underscores)
  const has8 =
    /(?:^|[_\-\s])8[_\-\s]*(?:lines?|ports?|p)(?:[_\-\s]|$)/i.test(searchable) ||
    /(?:^|[_\-\s])(?:1|2)[:\/x]8(?:[_\-\s]|$)/i.test(searchable) ||
    norm.includes("8 line") ||
    norm.includes("8line") ||
    norm.includes("8-line") ||
    norm.includes("1:8") ||
    norm.includes("1/8") ||
    norm.includes("8p") ||
    norm.includes("8-p") ||
    norm.includes("8 port") ||
    norm.includes("8port");

  // 2. Explicit 16-lines / 1:16 / 16-port checks
  const has16 =
    /(?:^|[_\-\s])16[_\-\s]*(?:lines?|ports?|p)(?:[_\-\s]|$)/i.test(searchable) ||
    /(?:^|[_\-\s])(?:1|2)[:\/x]16(?:[_\-\s]|$)/i.test(searchable) ||
    norm.includes("16 line") ||
    norm.includes("16line") ||
    norm.includes("16-line") ||
    norm.includes("1:16") ||
    norm.includes("1/16") ||
    norm.includes("16p") ||
    norm.includes("16-p") ||
    norm.includes("16 port") ||
    norm.includes("16port");

  if (has8 && !has16) {
    if (/(?:^|[_\-\s])2[:\/x]8(?:[_\-\s]|$)/i.test(searchable) || norm.includes("2:8") || norm.includes("2/8")) {
      return "2:8";
    }
    return "1:8";
  }
  if (has16 && !has8) {
    if (/(?:^|[_\-\s])2[:\/x]16(?:[_\-\s]|$)/i.test(searchable) || norm.includes("2:16") || norm.includes("2/16")) {
      return "2:16";
    }
    return "1:16";
  }

  if (
    norm.includes("4 line") ||
    norm.includes("4line") ||
    norm.includes("4-line") ||
    norm.includes("1:4") ||
    norm.includes("1/4") ||
    norm.includes("4p") ||
    norm.includes("4-p") ||
    norm.includes("4 port") ||
    norm.includes("4port")
  ) {
    return "1:4";
  }
  if (
    norm.includes("32 line") ||
    norm.includes("32line") ||
    norm.includes("32-line") ||
    norm.includes("1:32") ||
    norm.includes("1/32") ||
    norm.includes("32p") ||
    norm.includes("32-p") ||
    norm.includes("32 port")
  ) {
    return "1:32";
  }
  if (norm.includes("2:8") || norm.includes("2/8")) {
    return "2:8";
  }
  if (norm.includes("2:16") || norm.includes("2/16")) {
    return "2:16";
  }
  return defaultSplitter;
}

export function splitterToPorts(splitter: NapSplitter): number {
  switch (splitter) {
    case "1:4":
      return 4;
    case "1:8":
    case "2:8":
      return 8;
    case "1:16":
    case "2:16":
      return 16;
    case "1:32":
      return 32;
    default:
      return 8;
  }
}

export function detectProjectPrefix(placemarks: Placemark[], fileName = ""): string {
  if (fileName) {
    const mFile =
      fileName.match(/^([A-Za-z]{2,5}\d{1,5})\b/i) ||
      fileName.match(/^([A-Za-z0-9]+)_(?:HLD|LLD|KMZ|FIBER|FTTH)\b/i);
    if (mFile) return mFile[1].toUpperCase();
  }
  for (const p of placemarks) {
    const name = p.name || (p.properties && (p.properties.Name || p.properties.name)) || "";
    const mName =
      name.match(/^([A-Za-z]{2,5}\d{1,5})_/i) ||
      name.match(/^([A-Za-z0-9]+)_[LC]\d+_/i);
    if (mName) return mName[1].toUpperCase();
  }
  for (const p of placemarks) {
    const name = p.name || (p.properties && (p.properties.Name || p.properties.name)) || "";
    const mThree = name.match(/^([A-Za-z0-9]+)_[A-Za-z0-9]+_[A-Za-z0-9]+/);
    if (mThree) return mThree[1].toUpperCase();
  }
  return "";
}

export function formatDummyNapId(cleanName: string, projectPrefix = "", feederCode = "C01"): string {
  // If it's already a full HLD format e.g. MIN4026_C01_D01 or MIN929_C01_D01
  const mFull = cleanName.match(/^([A-Za-z0-9]+_[A-Za-z0-9]+_[A-Za-z0-9]+)\b/i);
  if (mFull) return mFull[1].toUpperCase();

  // If it's D1, D01, D2, DUMMY-1, DUMMY 01
  const mDummy = cleanName.match(/^(?:D|DUMMY[_\-\s]*)(\d+)\b/i);
  if (mDummy) {
    const num = String(Number(mDummy[1])).padStart(2, "0");
    const cable = feederCode || "C01";
    const prefix = projectPrefix ? `${projectPrefix}_${cable}_` : "";
    return `${prefix}D${num}`;
  }

  return cleanName ? cleanName.toUpperCase() : "D01";
}

export function detectNapId(
  placemark: Placemark,
  index: number,
  status?: NapStatus,
  projectPrefix = "",
  feederCode = "C01",
): string {
  const explicit =
    placemark.properties.NAP_ID ||
    placemark.properties.nap_id ||
    placemark.properties.NapID ||
    placemark.properties.FAT_ID ||
    placemark.properties.fat_id ||
    placemark.properties.FDP_ID ||
    placemark.properties.Name ||
    placemark.properties.name ||
    placemark.name ||
    "";
  const cleanName = explicit.trim();
  const unbatchedName = stripBatchIdentifier(cleanName);
  const folder = placemark.properties.Folder || placemark.properties._folder || "";

  // Dummy NAP detection & formatting (e.g. D1 -> MIN4026_C01_D01, CRA_001_C02_D02)
  const isDummy =
    status === "DUMMY" ||
    isDummyNapIdentifier(unbatchedName, folder) ||
    isDummyNapIdentifier(cleanName, folder) ||
    isDummyNapIdentifier(placemark.name.trim(), folder);
  if (isDummy) {
    return formatDummyNapId(unbatchedName || cleanName || placemark.name.trim(), projectPrefix, feederCode);
  }

  if (explicit && explicit.trim() && !explicit.toLowerCase().startsWith("untitled")) {
    // Pattern 1: HLD standard format e.g. MIN4026_L901_N01_16 LINES -> MIN4026_L901_N01, CRA_001_L907_N01_16 LINES -> CRA_001_L907_N01
    const cleanHld = unbatchedName.replace(/(?:_|\s+)(?:[0-9]+\s*LINES?|[0-9]+\s*P|[0-9]+\s*PORTS?)\b.*$/i, "").trim();
    if (cleanHld && cleanHld !== unbatchedName) return cleanHld;

    if (unbatchedName) return unbatchedName;
    return cleanName;
  }

  // Pattern 2: Standard Telco NAP / FAT / FDP / FDT / TCR
  const match = unbatchedName.match(/\b(NAP[\w\.\-]+|FAT[\w\.\-]+|FDP[\w\.\-]+|FDT[\w\.\-]+|TCR[\w\.\-]+)\b/i);
  if (match) return match[1];

  if (unbatchedName && !unbatchedName.toLowerCase().startsWith("untitled")) {
    return unbatchedName;
  }

  return `NAP-${String(index + 1).padStart(2, "0")}`;
}

export function detectPoleRef(placemark: Placemark): string {
  const explicit =
    placemark.properties.POLE_TAG ||
    placemark.properties.pole_tag ||
    placemark.properties.PoleTag ||
    placemark.properties.POLE_ID ||
    placemark.properties.pole_id ||
    placemark.properties.PoleID ||
    placemark.properties.POLE ||
    placemark.properties.pole;
  if (explicit && explicit.trim()) return explicit.trim();

  const searchable = [placemark.name, placemark.description].join(" ");
  const match = searchable.match(/\b(PT[_\-\s]*[0-9A-Z]+|P[0-9]{1,4}|POLE[_\-\s]*[0-9A-Z]+)\b/i);
  if (match) return match[1].replace(/\s+/g, "-").toUpperCase();

  return "";
}

export function detectFeederRef(placemark: Placemark): string {
  const explicit =
    placemark.properties.FEEDER ||
    placemark.properties.feeder ||
    placemark.properties.CABLE ||
    placemark.properties.cable ||
    placemark.properties.ROUTE ||
    placemark.properties.route ||
    placemark.properties.LOOP ||
    placemark.properties.loop;
  if (explicit && explicit.trim()) return explicit.trim();

  const searchable = [placemark.name, placemark.description].join(" ");
  // Match Loop e.g. L901 in MIN4026_L901_N01
  const mLoop = searchable.match(/(?:^|[_\-\s])(L\d{2,4})(?:[_\-\s]|$)/i);
  if (mLoop) return `LOOP ${mLoop[1].toUpperCase()}`;

  const match = searchable.match(/\b(F[0-9]{1,3}|FEEDER[_\-\s]*[0-9A-Z]+|DIST[_\-\s]*[0-9A-Z]+)\b/i);
  if (match) return match[1].toUpperCase();

  return "";
}

export function isLcpNapIdentifier(name: string, napId = "", index = 0): boolean {
  const combined = `${name} ${napId}`.toUpperCase();
  if (/\bNON[\s\-_]*LCP\b/.test(combined)) return false;
  if (/\bLCP\b/.test(combined)) return true;
  // N01, N1, NAP-01, NAP-1, NAP 01, NAP_01, _N01_
  if (/(?:^|[_\-\s])(?:N|NAP)[_\-\s]*0?1(?:[_\-\s]|$)/i.test(combined)) return true;
  // N02..N04 or higher: N02, N03, N04, etc.
  if (/(?:^|[_\-\s])(?:N|NAP)[_\-\s]*0?([2-9]|\d{2,})(?:[_\-\s]|$)/i.test(combined)) return false;
  return index === 0;
}

export function resolveHldNapLayer(
  placemark: Placemark,
  standard: HldNapStandard,
  index = 0,
  status?: NapStatus,
  isDummy?: boolean,
  splitter?: string,
  ports?: number,
  napId = "",
): LayerName {
  const folder = placemark.properties?.Folder || placemark.properties?._folder || "";
  const isEx = status === "EXISTING" || status === "SOURCE";
  const isDum =
    Boolean(isDummy) ||
    status === "DUMMY" ||
    isDummyNapIdentifier(placemark.name, folder);

  if (isDum) {
    return isEx ? "EXISTING DUMMY NAP" : "NEW DUMMY NAP";
  }

  const searchable = `${placemark.name || ""} ${napId || ""} ${placemark.description || ""}`;
  const is8Lines =
    standard.stencilStyle === "lines8p" ||
    splitter === "1:8" ||
    splitter === "2:8" ||
    ports === 8 ||
    /(\b|_)(8[\s\-_]*(?:lines?|ports?|p)|1[:\/]8)(\b|_)/i.test(searchable);

  const linesTag = is8Lines ? "8-LINES" : "16-LINES";

  if (isEx) {
    return `EXISTING NAP ${linesTag}` as LayerName;
  }

  const isLcp = isLcpNapIdentifier(placemark.name, napId, index);
  const lcpTag = isLcp ? "LCP" : "NON-LCP";
  return `NEW NAP ${linesTag} ${lcpTag}` as LayerName;
}

export function classifyNapPlacemark(
  placemark: Placemark,
  standard: HldNapStandard,
  index: number = 0,
  projectPrefix = "",
): ClassifiedNapPlacemark {
  const folder = placemark.properties.Folder || placemark.properties._folder || "";
  const searchable = [
    placemark.name,
    placemark.description,
    folder,
    ...Object.keys(placemark.properties),
    ...Object.values(placemark.properties),
  ].join(" ");

  const status = detectNapStatus(searchable, folder);
  const isDummy = status === "DUMMY" || isDummyNapIdentifier(placemark.name, folder);
  const splitter = detectNapSplitter(searchable, standard.defaultSplitter);
  const ports = isDummy ? 0 : splitterToPorts(splitter);
  const feederRef = detectFeederRef(placemark);
  const mCable = feederRef.match(/(?:CABLE|C)\s*(\d+)/i);
  const feederCode = mCable ? `C${String(Number(mCable[1])).padStart(2, "0")}` : "C01";
  const napId = detectNapId(placemark, index, status, projectPrefix, feederCode);
  const poleRef = detectPoleRef(placemark);

  const isCluster =
    normalize(folder).includes("cluster") ||
    normalize(folder).includes("polygon") ||
    normalize(placemark.name).includes("cluster") ||
    normalize(placemark.name).startsWith("cluster") ||
    /^ph\d+/i.test(placemark.name.trim()) ||
    Object.keys(placemark.properties).some((k) => k.toLowerCase().includes("cluster")) ||
    Object.values(placemark.properties).some((v) => typeof v === "string" && v.toLowerCase().includes("cluster")) ||
    /^\d{4}-\d{5}-[A-Z0-9]+(?:_CUT_\d+)?$/i.test(placemark.name.trim());

  if (isCluster) {
    return {
      ...placemark,
      layer: "CLUSTER_BOUNDARIES",
      napId,
      status,
      splitter,
      ports,
      poleRef,
      feederRef,
      isDummy,
    };
  }

  if (placemark.geometry.type === "Point") {
    let layer: LayerName = "NAPS";
    const isNap = isNapEntity(placemark.name, folder);
    const isPole = !isNap && isPolePlacemark(placemark, folder);

    if (isPole) {
      const poleLayer = determinePoleLayer(placemark, standard.telcoProvider);
      return {
        ...placemark,
        layer: poleLayer,
        napId: placemark.name,
        status: "VETTED",
        splitter: standard.defaultSplitter,
        ports: 0,
        poleRef: placemark.name,
        feederRef,
        isDummy: false,
      };
    }

    if (
      !isNap &&
      (normalize(placemark.name).includes("olt") ||
        normalize(placemark.name).includes("closure") ||
        normalize(folder).includes("olt") ||
        normalize(folder).includes("poi"))
    ) {
      layer = "OLT_POI";
    } else {
      layer = resolveHldNapLayer(placemark, standard, index, status, isDummy, splitter, ports, napId);
    }

    return {
      ...placemark,
      layer,
      napId,
      status,
      splitter,
      ports,
      poleRef,
      feederRef,
      isDummy,
    };
  }

  if (hasAny(searchable, roadKeywords)) {
    return {
      ...placemark,
      layer: "ROAD_BOUNDARIES",
      napId,
      status,
      splitter,
      ports,
      poleRef,
      feederRef,
    };
  }

  if (
    hasAny(searchable, feederKeywords) ||
    hasAny(searchable, cableKeywords) ||
    placemark.geometry.type === "LineString"
  ) {
    return {
      ...placemark,
      layer: "FEEDER_CABLES",
      napId,
      status,
      splitter,
      ports,
      poleRef,
      feederRef,
    };
  }

  return {
    ...placemark,
    layer: placemark.geometry.type === "Polygon" ? "SOURCE_POLYGONS" : "SOURCE_LINES",
    napId,
    status,
    splitter,
    ports,
    poleRef,
    feederRef,
  };
}

function createRoadPlacemark(
  id: number | string,
  name: string,
  highway: string,
  coordinates: LonLat[],
  tags: Record<string, string> = {},
): ClassifiedPlacemark {
  return {
    id: `osm-road-${id}`,
    name,
    description: "Road centerline from OpenStreetMap",
    properties: { source: "OpenStreetMap", ...tags, highway },
    geometry: { type: "LineString", coordinates },
    layer: "ROAD_CENTERLINES",
  };
}

function createOsmPolygonPlacemark(
  id: number,
  name: string,
  layer: "BUILDING_FOOTPRINTS" | "RESIDENTIAL_AREAS" | "COMMERCIAL_AREAS" | "INDUSTRIAL_AREAS" | "COMMUNITY_AREAS",
  coordinates: LonLat[],
  properties: Record<string, string>,
): ClassifiedPlacemark {
  return {
    id: `osm-${layer.toLowerCase()}-${id}`,
    name,
    description: "Reference polygon from OpenStreetMap",
    properties: { source: "OpenStreetMap", ...properties },
    geometry: { type: "Polygon", coordinates: [coordinates] },
    layer,
  };
}

function osmDemandLayer(tags: Record<string, string>): "RESIDENTIAL_AREAS" | "COMMERCIAL_AREAS" | "INDUSTRIAL_AREAS" | "COMMUNITY_AREAS" {
  const landuse = normalize(tags.landuse || "");
  const amenity = normalize(tags.amenity || "");
  const building = normalize(tags.building || "");

  if (["commercial", "retail"].includes(landuse) || tags.shop || tags.office || ["commercial", "retail", "supermarket", "mall"].includes(building)) {
    return "COMMERCIAL_AREAS";
  }
  if (["industrial", "garages"].includes(landuse) || ["industrial", "warehouse"].includes(building)) {
    return "INDUSTRIAL_AREAS";
  }
  if (
    ["school", "college", "university", "hospital", "clinic", "place_of_worship", "community_centre", "public_building", "townhall"].includes(amenity) ||
    ["school", "university", "hospital", "church", "civic", "public"].includes(building)
  ) {
    return "COMMUNITY_AREAS";
  }
  return "RESIDENTIAL_AREAS";
}

function osmDemandLabel(layer: LayerName) {
  if (layer === "COMMERCIAL_AREAS") return "Commercial/retail area";
  if (layer === "INDUSTRIAL_AREAS") return "Industrial/warehouse area";
  if (layer === "COMMUNITY_AREAS") return "Community/institution area";
  return "Residential/lot area";
}

function isClosedWay(coordinates: LonLat[]) {
  if (coordinates.length < 4) return false;
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  return Math.abs(first.lon - last.lon) < 0.0000001 && Math.abs(first.lat - last.lat) < 0.0000001;
}

function collectCoordinates(placemarks: Placemark[]) {
  const coords: LonLat[] = [];
  placemarks.forEach((placemark) => {
    if (placemark.geometry.type === "Point") coords.push(placemark.geometry.coordinates);
    if (placemark.geometry.type === "LineString") coords.push(...placemark.geometry.coordinates);
    if (placemark.geometry.type === "Polygon") placemark.geometry.coordinates.forEach((ring) => coords.push(...ring));
  });
  return coords;
}

function calculateCenter(coords: LonLat[]): LonLat {
  if (!coords.length) return { lon: 0, lat: 0 };
  const sum = coords.reduce(
    (acc, point) => ({ lon: acc.lon + point.lon, lat: acc.lat + point.lat }),
    { lon: 0, lat: 0 },
  );
  return { lon: sum.lon / coords.length, lat: sum.lat / coords.length };
}

function utmZone(lon: number) {
  return Math.max(1, Math.min(60, Math.floor((lon + 180) / 6) + 1));
}

function lonLatToUtm(point: LonLat, zone: number): CadPoint {
  const a = 6378137;
  const f = 1 / 298.257223563;
  const k0 = 0.9996;
  const e = Math.sqrt(f * (2 - f));
  const ePrimeSq = e ** 2 / (1 - e ** 2);
  const latRad = (point.lat * Math.PI) / 180;
  const lonRad = (point.lon * Math.PI) / 180;
  const lonOrigin = ((zone - 1) * 6 - 180 + 3) * (Math.PI / 180);
  const n = a / Math.sqrt(1 - e ** 2 * Math.sin(latRad) ** 2);
  const t = Math.tan(latRad) ** 2;
  const c = ePrimeSq * Math.cos(latRad) ** 2;
  const aa = Math.cos(latRad) * (lonRad - lonOrigin);
  const m =
    a *
    ((1 - e ** 2 / 4 - (3 * e ** 4) / 64 - (5 * e ** 6) / 256) * latRad -
      ((3 * e ** 2) / 8 + (3 * e ** 4) / 32 + (45 * e ** 6) / 1024) * Math.sin(2 * latRad) +
      ((15 * e ** 4) / 256 + (45 * e ** 6) / 1024) * Math.sin(4 * latRad) -
      ((35 * e ** 6) / 3072) * Math.sin(6 * latRad));

  const x =
    k0 *
      n *
      (aa +
        ((1 - t + c) * aa ** 3) / 6 +
        ((5 - 18 * t + t ** 2 + 72 * c - 58 * ePrimeSq) * aa ** 5) / 120) +
    500000;

  const y =
    k0 *
    (m +
      n *
        Math.tan(latRad) *
        (aa ** 2 / 2 +
          ((5 - t + 9 * c + 4 * c ** 2) * aa ** 4) / 24 +
          ((61 - 58 * t + t ** 2 + 600 * c - 330 * ePrimeSq) * aa ** 6) / 720));

  return { x, y: point.lat < 0 ? y + 10000000 : y, z: point.alt ?? 0 };
}

function lonLatToRawCad(point: LonLat): CadPoint {
  return { x: point.lon, y: point.lat, z: point.alt ?? 0 };
}

function latLonToRawCad(point: LonLat): CadPoint {
  return { x: point.lat, y: point.lon, z: point.alt ?? 0 };
}

/**
 * WGS 84 / World Mercator (EPSG:3395)
 * Exact ellipsoidal Mercator projection matching the company's KMZ_to_DXF converter (pyproj EPSG:3395).
 */
function lonLatToWgs84Mercator(point: LonLat): CadPoint {
  const a = 6378137.0;
  const f = 1 / 298.257223563;
  const e = Math.sqrt(f * (2 - f));
  const latRad = Math.max(-89.5, Math.min(89.5, point.lat)) * (Math.PI / 180);
  const lonRad = point.lon * (Math.PI / 180);
  const sinLat = Math.sin(latRad);
  const mercatorPart =
    Math.tan(Math.PI / 4 + latRad / 2) *
    ((1 - e * sinLat) / (1 + e * sinLat)) ** (e / 2);
  return { x: a * lonRad, y: a * Math.log(mercatorPart), z: point.alt ?? 0 };
}

function wgs84MercatorToLonLat(point: CadPoint): LonLat {
  const a = 6378137.0;
  const f = 1 / 298.257223563;
  const e = Math.sqrt(f * (2 - f));
  const e2 = e * e;
  const e4 = e2 * e2;
  const e6 = e4 * e2;
  const e8 = e6 * e2;
  const lon = (point.x / a) * (180 / Math.PI);
  const t = Math.exp(-point.y / a);
  const chi = Math.PI / 2 - 2 * Math.atan(t);
  const latRad =
    chi +
    (e2 / 2 + (5 * e4) / 24 + e6 / 12 + (13 * e8) / 360) * Math.sin(2 * chi) +
    ((7 * e4) / 48 + (29 * e6) / 240 + (811 * e8) / 11520) * Math.sin(4 * chi) +
    ((7 * e6) / 120 + (81 * e8) / 1120) * Math.sin(6 * chi) +
    ((4279 * e8) / 161280) * Math.sin(8 * chi);
  return { lon, lat: latRad * (180 / Math.PI), alt: point.z };
}

/**
 * WGS 84 / Pseudo-Mercator (EPSG:3857 / Web Mercator)
 */
function lonLatToPseudoMercator(point: LonLat): CadPoint {
  const a = 6378137.0;
  const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, point.lat));
  const latRad = (clampedLat * Math.PI) / 180.0;
  const lonRad = (point.lon * Math.PI) / 180.0;
  const x = a * lonRad;
  const y = a * Math.log(Math.tan(Math.PI / 4.0 + latRad / 2.0));
  return { x, y, z: point.alt ?? 0 };
}

function utmToLonLat(point: CadPoint, zone: number, northernHemisphere: boolean): LonLat {
  const a = 6378137;
  const f = 1 / 298.257223563;
  const k0 = 0.9996;
  const e = Math.sqrt(f * (2 - f));
  const e1 = (1 - Math.sqrt(1 - e ** 2)) / (1 + Math.sqrt(1 - e ** 2));
  const ePrimeSq = e ** 2 / (1 - e ** 2);
  const x = point.x - 500000;
  const y = northernHemisphere ? point.y : point.y - 10000000;
  const lonOrigin = ((zone - 1) * 6 - 180 + 3) * (Math.PI / 180);
  const m = y / k0;
  const mu = m / (a * (1 - e ** 2 / 4 - (3 * e ** 4) / 64 - (5 * e ** 6) / 256));
  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);
  const n1 = a / Math.sqrt(1 - e ** 2 * Math.sin(phi1) ** 2);
  const t1 = Math.tan(phi1) ** 2;
  const c1 = ePrimeSq * Math.cos(phi1) ** 2;
  const r1 = (a * (1 - e ** 2)) / (1 - e ** 2 * Math.sin(phi1) ** 2) ** 1.5;
  const d = x / (n1 * k0);
  const lat =
    phi1 -
    ((n1 * Math.tan(phi1)) / r1) *
      (d ** 2 / 2 -
        ((5 + 3 * t1 + 10 * c1 - 4 * c1 ** 2 - 9 * ePrimeSq) * d ** 4) / 24 +
        ((61 + 90 * t1 + 298 * c1 + 45 * t1 ** 2 - 252 * ePrimeSq - 3 * c1 ** 2) * d ** 6) / 720);
  const lon =
    lonOrigin +
    (d -
      ((1 + 2 * t1 + c1) * d ** 3) / 6 +
      ((5 - 2 * c1 + 28 * t1 - 3 * c1 ** 2 + 8 * ePrimeSq + 24 * t1 ** 2) * d ** 5) / 120) /
      Math.cos(phi1);

  return { lon: (lon * 180) / Math.PI, lat: (lat * 180) / Math.PI, alt: point.z };
}

function dxfPair(code: number, value: string | number) {
  return `${code}\n${value}`;
}

function cadCoord(value: number) {
  return value.toFixed(8);
}

function cadSize(value: number) {
  return value.toFixed(8);
}

let dxfHandleCounter = 256;

function resetDxfHandles() {
  dxfHandleCounter = 256;
}

function dxfHandle() {
  const handle = dxfHandleCounter.toString(16).toUpperCase();
  dxfHandleCounter += 1;
  return handle;
}

function sanitizeDxfText(value: string) {
  return value.replace(/[{}\\]/g, "").replace(/\r?\n/g, " ").slice(0, 220);
}

function sanitizeMText(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.replace(/[{}\\]/g, "").trim())
    .filter(Boolean)
    .join("\\P")
    .slice(0, 900);
}

function normalizeFieldName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findProperty(properties: Record<string, string>, names: string[]) {
  const normalized = new Map(Object.entries(properties).map(([key, value]) => [normalizeFieldName(key), value]));
  for (const name of names) {
    const value = normalized.get(normalizeFieldName(name));
    if (value) return value;
  }
  return "";
}

function cleanFieldValue(value: string) {
  return value.replace(/&nbsp;/gi, "").trim();
}

function formatPoleType(properties: Record<string, string>) {
  if (properties._mapsMePoleType) {
    return properties._mapsMePoleType;
  }
  // Pole material attributes in the KMZ determine the pole type (Concrete -> CC, Metal/Steel -> ST, Wood -> WO)
  const material = normalize(
    findProperty(properties, ["material", "pole material", "pole_material", "material / size", "material/size", "materialsize"]),
  );
  if (material.includes("concrete") || material === "cc" || /^cc\b/.test(material)) return "CC";
  if (material.includes("metal") || material.includes("steel") || material.includes("gi") || material.includes("iron") || material.includes("st") || material === "me" || /^(?:st|gi|sc)\b/.test(material)) return "ST";
  if (material.includes("wood") || material.includes("wo") || material.includes("wp") || /^w(?:o|p)?\b/.test(material)) return "WO";

  const explicitType = cleanFieldValue(
    findProperty(properties, ["stencil type", "label type", "pole class", "pole type code"]),
  );
  if (explicitType && !["electricity", "telecom", "pole"].includes(normalize(explicitType))) {
    const norm = explicitType.toUpperCase();
    if (norm === "WOOD" || norm === "WOODEN" || norm === "WP" || norm === "WO") return "WO";
    if (norm === "METAL" || norm === "STEEL" || norm === "GI" || norm === "SC" || norm === "ST") return "ST";
    if (norm === "CONCRETE" || norm === "CC") return "CC";
    return norm;
  }

  return "CC";
}

function formatRawPoleType(properties: Record<string, string>) {
  return formatPoleType(properties);
}

function isProposedPole(placemark: Placemark) {
  if (placemark.properties?._mapsMeKind) {
    return placemark.properties._mapsMeKind === "PROPOSED";
  }
  const category = normalize(findProperty(placemark.properties, ["pole category(new or existing)", "pole category", "category", "status", "pole status"]));
  if (category.includes("new") || category.includes("proposed") || category.includes("propose")) return true;
  if (category === "existing" || category === "exist") return false;

  const proposedPoleProp = cleanFieldValue(findProperty(placemark.properties, ["proposed pole", "proposed_pole", "proposedpole"]));
  if (proposedPoleProp) return true;

  const rawType = normalize(findProperty(placemark.properties, ["stencil type", "label type", "pole class", "type"]));
  if (rawType.includes("proposed") || rawType.includes("p-pole") || rawType.includes("ppole")) return true;

  const nameDesc = normalize([placemark.name, (placemark.description || "").replace(/<[^>]+>/g, " ")].join(" "));
  return (
    nameDesc.includes("proposed") ||
    nameDesc.includes("prop pole") ||
    nameDesc.includes("prop-pole") ||
    nameDesc.includes("p-pole") ||
    nameDesc.includes("ppole") ||
    nameDesc.includes("new pole") ||
    nameDesc.includes("for installation") ||
    /^p(?:rop)?[-_\s]*\d+/i.test(placemark.name.trim())
  );
}

function resolveGlobeProposedPoleHeight(placemark: Placemark): string {
  if (placemark.properties?._mapsMePoleHeight) {
    return placemark.properties._mapsMePoleHeight;
  }
  const rawName = (placemark.name || "").trim();
  if (/^p(?:rop)?[-_\s]*7(?:\b|$)/i.test(rawName)) {
    return "7.5m";
  }
  return "9.0m";
}

function poleTemplateFields(placemark: Placemark & { poleId?: string }) {
  const point = placemark.geometry.type === "Point" ? placemark.geometry.coordinates : { lat: 0, lon: 0 };
  const poleNo = rawPoleTag(placemark);
  const poleType = formatPoleType(placemark.properties);
  const proposed = isProposedPole(placemark);
  const owner = findProperty(placemark.properties, ["owner", "provider", "company", "telco"]) || detectPoleOwner(placemark);
  return {
    name: placemark.name,
    poleId: placemark.poleId || placemark.name,
    poleTag: poleNo,
    poleNo: proposed ? "PROPOSED POLE" : poleNo,
    poleType,
    rawPoleType: poleType,
    id: placemark.id,
    owner,
    type: poleType,
    code: findProperty(placemark.properties, ["code", "pole_code", "pole code", "asset_id", "asset id"]),
    lat: point.lat.toFixed(6),
    lon: point.lon.toFixed(6),
    latitude: point.lat.toFixed(6),
    longitude: point.lon.toFixed(6),
    raw: Object.entries(placemark.properties)
      .map(([key, value]) => `${key}:${value}`)
      .join(" "),
  };
}

function formatTelcoPoleTag(rawTag: string, owner: string) {
  let cleanTag = (rawTag || "").trim();
  cleanTag = cleanTag.replace(/^(?:GT|PT|IC|DITO|CONVERGE|GLOBE|PLDT|INNOVE|TELOF|ETPI|C)\s*[-_:]\s*/i, "").trim();

  let prefix = "GT";
  const normOwner = (owner || "").toUpperCase();
  if (normOwner.includes("INNOVE")) prefix = "IC";
  else if (normOwner.includes("GLOBE")) prefix = "GT";
  else if (normOwner.includes("PLDT") || normOwner.includes("SMART")) prefix = "PT";
  else if (normOwner.includes("CONVERGE") || normOwner.includes("ICT")) prefix = "C";
  else if (normOwner.includes("DITO")) prefix = "DITO";
  else if (normOwner.includes("TELOF")) prefix = "TELOF";
  else if (normOwner.includes("ETPI")) prefix = "ETPI";
  else prefix = "GT";

  if (!cleanTag || /^npt$/i.test(cleanTag)) {
    return `${prefix} - NPT`;
  }
  return `${prefix} - ${cleanTag}`;
}

/** Resolves the real survey pole tag from properties (e.g. "51X64", "51344", "GT - 1022", "PT - NPT", "IC - 006", "DITO - NPT"). */
function rawPoleTag(placemark: Placemark) {
  if (isProposedPole(placemark)) return "PROPOSED POLE";
  if (placemark.properties?._mapsMePoleNo) {
    return placemark.properties._mapsMePoleNo;
  }

  const suppliedTag = cleanFieldValue(
    findProperty(placemark.properties, [
      "pole tag #",
      "pole tag",
      "pole_tag",
      "poletag",
      "pole no",
      "pole_no",
      "pole number",
      "pole_number",
      "tag",
      "code",
      "poleid",
      "pole_id",
    ]),
  );

  const owner = detectPoleOwner(placemark);
  const isElec = isElectricPole(placemark);

  if (isElec) {
    if (suppliedTag) {
      if (/^npt$/i.test(suppliedTag)) return "NPT";
      return suppliedTag;
    }
    const isGenericIndex = /^(?:PI_|Pl_|Point_|Placemark\s*)/i.test(placemark.name.trim());
    if (!isGenericIndex && placemark.name.trim()) {
      const cleanName = placemark.name.replace(/\bcc\b/gi, "").replace(/^[\s,;:/-]+|[\s,;:/-]+$/g, "").trim();
      if (cleanName) return cleanName;
    }
    return "NPT";
  }

  // Telco pole: format as GT - <TAG>, PT - <TAG>, IC - <TAG>, DITO - <TAG>
  let tagToFormat = suppliedTag;
  if (!tagToFormat) {
    const isGenericIndex = /^(?:PI_|Pl_|Point_|Placemark\s*)/i.test(placemark.name.trim());
    if (!isGenericIndex && placemark.name.trim()) {
      tagToFormat = placemark.name.replace(/\bcc\b/gi, "").replace(/^[\s,;:/-]+|[\s,;:/-]+$/g, "").trim();
    }
  }

  return formatTelcoPoleTag(tagToFormat, owner);
}

function rawPoleRows(placemarks: ClassifiedPlacemark[]) {
  const rows: Array<{ poleTag: string; poleType: string; poleCode: string; latitude: string; longitude: string }> = [];
  for (const placemark of placemarks) {
    if (placemark.geometry.type !== "Point") continue;
    const point = placemark.geometry.coordinates;
    rows.push({
      poleTag: rawPoleTag(placemark),
      poleType: formatRawPoleType(placemark.properties),
      poleCode: isProposedPole(placemark) ? "P-POLE" : isElectricPole(placemark) ? "EPOLE" : detectPoleCode(placemark),
      latitude: point.lat.toFixed(6),
      longitude: point.lon.toFixed(6),
    });
  }
  return rows;
}

function csvValue(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function rawPoleCsv(placemarks: ClassifiedPlacemark[]) {
  return [
    "Pole Tag,Type,Provider / Block,Coordinates",
    ...rawPoleRows(placemarks).map((row) => [row.poleTag, row.poleType, row.poleCode, `${row.latitude}, ${row.longitude}`].map(csvValue).join(",")),
  ].join("\r\n");
}

function createRawPoleStencilBaseDxf(center: LonLat, sourceName: string) {
  return createDxf([], center, `${sourceName} raw poles`, rawPoleMetricStandard, "mercator", "Standard").dxf;
}

function createRawPoleDxf(placemarks: ClassifiedPlacemark[], center: LonLat, sourceName: string) {
  const poles = placemarks.filter((placemark) => placemark.geometry.type === "Point");
  return createDxf(poles, center, `${sourceName} raw poles`, rawPoleMetricStandard, "mercator", "Standard").dxf;
}

function rawPoleStencilPlacements(placemarks: ClassifiedPlacemark[]) {
  return placemarks
    .filter((placemark) => placemark.geometry.type === "Point")
    .map((placemark) => {
      const point = (placemark.geometry as Extract<Geometry, { type: "Point" }>).coordinates;
      return {
        x: lonLatToWgs84Mercator(point).x,
        y: lonLatToWgs84Mercator(point).y,
        values: [
          rawPoleTag(placemark),
          formatRawPoleType(placemark.properties),
          `${point.lat.toFixed(6)}, ${point.lon.toFixed(6)}`,
        ],
      };
    });
}

function detectPoleOwner(placemark: Placemark): string {
  const explicitOwner = normalize(findProperty(placemark.properties, ["owner", "provider", "company", "telco", "pole owner", "pole_owner", "classification"]));

  if (placemark.properties?._mapsMeKind) {
    if (placemark.properties._mapsMeKind === "TELCO") {
      return placemark.properties._mapsMeOwner || "GLOBE";
    }
    if (placemark.properties._mapsMeKind === "PROPOSED") {
      return "OTHER";
    }
    if (explicitOwner) {
      for (const [key, code] of Object.entries(electricCoopAliases)) {
        if (explicitOwner.includes(key)) return code;
      }
    }
    return "ELECTRIC";
  }

  if (explicitOwner) {
    for (const [key, code] of Object.entries(electricCoopAliases)) {
      if (explicitOwner.includes(key)) return code;
    }
    for (const [key, code] of Object.entries(telcoAliases)) {
      if (explicitOwner.includes(key)) return code;
    }
    if (explicitOwner.includes("electric") || explicitOwner.includes("elec") || explicitOwner.includes("epole") || explicitOwner.includes("power") || explicitOwner.includes("utility")) return "ELECTRIC";
    return cleanFieldValue(findProperty(placemark.properties, ["owner", "provider", "company", "telco"])).toUpperCase();
  }

  // Check structured bullet prefix e.g. "ELEC • 51430 • CC • 7-9" or "PLDT • 56425 • CC • 7-9"
  const rawName = (placemark.name || "").trim();
  if (/^(?:elec|electric|epole)\s*[•·]/i.test(rawName)) return "ELECTRIC";
  if (/^(?:pldt|smart|pt)\s*[•·]/i.test(rawName)) return "PLDT";
  if (/^(?:meralco)\s*[•·]/i.test(rawName)) return "MERALCO";

  const folder = placemark.properties?.Folder || placemark.properties?._folder || "";
  const source = normalize([placemark.name, (placemark.description || "").replace(/<[^>]+>/g, " "), folder, ...Object.values(placemark.properties || {})].join(" "));

  for (const [key, code] of Object.entries(electricCoopAliases)) {
    if (key.length <= 4) {
      if (new RegExp(`\\b${key}\\b`, "i").test(source)) return code;
    } else {
      if (source.includes(key)) return code;
    }
  }

  for (const [key, code] of Object.entries(telcoAliases)) {
    if (key.length <= 4) {
      if (new RegExp(`\\b${key}\\b`, "i").test(source)) return code;
    } else {
      if (source.includes(key)) return code;
    }
  }

  if (/\b(?:cv|conv)[_\-\s]*\d+/i.test(placemark.name || "")) return "CONVERGE";
  if (/\b(?:gt|gl)[_\-\s]*\d+/i.test(placemark.name || "")) return "GLOBE";
  if (/\b(?:pt)[_\-\s]*\d+/i.test(placemark.name || "")) return "PLDT";
  if (/^(?:ep|epole|elec|electric)[-_\s0-9•·]/i.test((placemark.name || "").trim()) || source.includes("electric pole") || source.includes("power pole")) {
    return "ELECTRIC";
  }

  return "OTHER";
}

function isElectricPole(placemark: Placemark): boolean {
  if (placemark.properties?._mapsMeKind) {
    return placemark.properties._mapsMeKind === "ELECTRIC";
  }
  if (isProposedPole(placemark)) return false;

  const owner = detectPoleOwner(placemark);
  if (["PLDT", "GLOBE", "INNOVE", "SMART", "CONVERGE", "DITO", "TELOF", "ETPI"].includes(owner)) {
    return false;
  }
  if (owner !== "OTHER") {
    return true;
  }

  const rawOwner = normalize(findProperty(placemark.properties, ["owner", "provider", "company", "telco", "category", "pole category", "stencil type", "type", "classification"]));
  if (rawOwner.includes("electric") || rawOwner.includes("elec") || rawOwner.includes("power") || rawOwner.includes("utility") || rawOwner.includes("epole") || rawOwner.includes("coop")) {
    return true;
  }

  const nameDesc = normalize([placemark.name, (placemark.description || "").replace(/<[^>]+>/g, " ")].join(" "));
  return (
    nameDesc.includes("electric") ||
    nameDesc.includes("power") ||
    nameDesc.includes("epole") ||
    nameDesc.includes("utility") ||
    /\bnpt\b/i.test(placemark.name || "") ||
    /^ep[-_\s0-9]/i.test((placemark.name || "").trim()) ||
    /^ep$/i.test((placemark.name || "").trim()) ||
    /^epnpt/i.test((placemark.name || "").trim())
  );
}

export function determinePoleLayer(
  placemark: Placemark,
  provider: TelcoProvider = "globe",
  electricUtility = "AUTO",
): LayerName {
  const pldtMode = isPldtProvider(provider);
  if (isProposedPole(placemark)) {
    return pldtMode ? "P-POLE" : "P-POLE 9.14m CC";
  }

  const detectedOwner = detectPoleOwner(placemark);

  // 1. Telco Poles
  if (detectedOwner === "PLDT" || hasPtIdentification(placemark)) return "PLDT";
  if (detectedOwner === "GLOBE" || detectedOwner === "INNOVE") return "GLOBE";
  if (detectedOwner === "CONVERGE") return "CONVERGE";
  if (detectedOwner === "DITO") return "DITO";
  if (detectedOwner === "TELOF") return "TELOF";
  if (detectedOwner === "ETPI") return "ETPI";

  // 2. Electric Poles with detected utility coop
  if (detectedOwner && detectedOwner !== "OTHER" && detectedOwner !== "ELECTRIC") {
    return detectedOwner as LayerName;
  }

  // 3. User-configured electricUtility
  const configuredUtility = (electricUtility || "AUTO").toUpperCase().trim();
  if (configuredUtility && configuredUtility !== "AUTO" && configuredUtility !== "GENERIC") {
    if (isElectricPole(placemark) || detectedOwner === "ELECTRIC" || detectedOwner === "OTHER") {
      return configuredUtility as LayerName;
    }
  }

  // 4. Generic Electric
  if (isElectricPole(placemark) || detectedOwner === "ELECTRIC") {
    return pldtMode ? "ELECTRIC POLE" : "EXPOLE";
  }

  // 5. Default fallback by provider
  return pldtMode ? "PLDT" : "GLOBE";
}

function detectPoleCode(placemark: Placemark): string {
  if (placemark.properties?._mapsMePoleCode) {
    return placemark.properties._mapsMePoleCode;
  }
  const owner = detectPoleOwner(placemark);
  if (owner === "INNOVE") return "I";
  if (owner === "GLOBE") return "G";
  if (owner === "SMART") return "S";
  if (owner === "PLDT") return "P";
  if (owner === "CONVERGE") return "C";
  if (owner === "DITO") return "D";
  if (owner === "ETPI") return "E";
  if (owner === "TELOF") return "T";
  return "G";
}

function poleBlockName(placemark: ClassifiedPlacemark, blockPrefix = "") {
  if (isProposedPole(placemark)) return `${blockPrefix}POLE_MARK_PROPOSED`;
  const owner = detectPoleOwner(placemark);
  if (owner === "INNOVE") return `${blockPrefix}POLE_MARK_INNOVE`;
  if (owner === "GLOBE") return `${blockPrefix}POLE_MARK_GLOBE`;
  if (owner === "SMART") return `${blockPrefix}POLE_MARK_SMART`;
  if (owner === "ETPI") return `${blockPrefix}POLE_MARK_ETPI`;
  if (owner === "PLDT") return `${blockPrefix}POLE_MARK_PLDT`;
  if (owner === "CONVERGE") return `${blockPrefix}POLE_MARK_CONVERGE`;
  if (owner === "DITO") return `${blockPrefix}POLE_MARK_DITO`;
  return `${blockPrefix}POLE_MARK_OTHER`;
}

function renderPoleLabel(placemark: ClassifiedPlacemark, standard: PoleStandard) {
  const fields = poleTemplateFields(placemark);
  if (isProposedPole(placemark)) {
    return [fields.poleNo, fields.poleType, resolveGlobeProposedPoleHeight(placemark), `${fields.latitude},${fields.longitude}`].filter(Boolean).join("\n");
  }
  return standard.labelTemplate.replace(/\{([^}]+)\}/g, (_, fieldName: string) => {
    const key = fieldName.trim() as keyof typeof fields;
    return fields[key] || findProperty(placemark.properties, [fieldName.trim()]) || "";
  });
}

function poleOwnerLabel(placemark: ClassifiedPlacemark) {
  const owner = detectPoleOwner(placemark);
  if (owner === "INNOVE") return "INNOVE";
  if (owner === "GLOBE") return "GLOBE";
  if (owner === "SMART") return "SMART";
  if (owner === "PLDT") return "PLDT";
  if (owner === "CONVERGE") return "CONVERGE";
  if (owner === "DITO") return "DITO";
  if (owner === "ETPI") return "ETPI";
  return "OTHERS";
}

function poleMarkerLetter(placemark: ClassifiedPlacemark) {
  const owner = detectPoleOwner(placemark);
  if (owner === "INNOVE") return "I";
  if (owner === "GLOBE") return "G";
  if (owner === "SMART") return "S";
  if (owner === "PLDT") return "P";
  if (owner === "CONVERGE") return "C";
  if (owner === "DITO") return "D";
  if (owner === "ETPI") return "E";
  return "";
}



function entityLine(layer: LayerName, start: CadPoint, end: CadPoint, color?: number) {
  return [
    dxfPair(0, "LINE"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, layer),
    ...(color ? [dxfPair(62, color)] : []),
    dxfPair(100, "AcDbLine"),
    dxfPair(10, cadCoord(start.x)),
    dxfPair(20, cadCoord(start.y)),
    dxfPair(30, cadCoord(start.z)),
    dxfPair(11, cadCoord(end.x)),
    dxfPair(21, cadCoord(end.y)),
    dxfPair(31, cadCoord(end.z)),
  ].join("\n");
}

function entityCircle(layer: LayerName, center: CadPoint, radius: number, color?: number) {
  return [
    dxfPair(0, "CIRCLE"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, layer),
    ...(color ? [dxfPair(62, color)] : []),
    dxfPair(100, "AcDbCircle"),
    dxfPair(10, cadCoord(center.x)),
    dxfPair(20, cadCoord(center.y)),
    dxfPair(30, cadCoord(center.z)),
    dxfPair(40, cadSize(radius)),
  ].join("\n");
}

function entityInsert(layer: LayerName, blockName: string, point: CadPoint, scale: number) {
  return [
    dxfPair(0, "INSERT"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, layer),
    dxfPair(100, "AcDbBlockReference"),
    dxfPair(2, blockName),
    dxfPair(10, cadCoord(point.x)),
    dxfPair(20, cadCoord(point.y)),
    dxfPair(30, cadCoord(point.z)),
    dxfPair(41, cadSize(scale)),
    dxfPair(42, cadSize(scale)),
    dxfPair(43, cadSize(scale)),
  ].join("\n");
}



function entityText(
  layer: LayerName,
  text: string,
  point: CadPoint,
  height: number,
  rotation = 0,
  attachment = 1,
  width = Math.max(height * 12, 8),
  color?: number,
  textStyle = "STANDARD",
) {
  return [
    dxfPair(0, "MTEXT"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, layer),
    ...(color ? [dxfPair(62, color)] : []),
    dxfPair(100, "AcDbMText"),
    dxfPair(10, cadCoord(point.x)),
    dxfPair(20, cadCoord(point.y)),
    dxfPair(30, cadCoord(point.z)),
    dxfPair(40, cadSize(height)),
    dxfPair(41, cadSize(width)),
    dxfPair(71, attachment),
    dxfPair(72, 1),
    dxfPair(50, rotation.toFixed(3)),
    dxfPair(7, textStyle),
    dxfPair(1, sanitizeMText(text)),
  ].join("\n");
}

function entityMultilineText(
  layer: LayerName,
  text: string,
  point: CadPoint,
  height: number,
  rotation = 0,
  color?: number,
  textStyle = "STANDARD",
) {
  return entityText(layer, text, point, height, rotation, 1, Math.max(height * 12, 8), color, textStyle);
}

function entitySpanText(
  layer: LayerName,
  text: string,
  point: CadPoint,
  height: number,
  rotationDegrees = 0,
  textStyle = "STANDARD",
  color = 7,
) {
  let rot = rotationDegrees % 360;
  if (rot < 0) rot += 360;

  return [
    dxfPair(0, "TEXT"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, layer),
    dxfPair(62, color),
    dxfPair(100, "AcDbText"),
    dxfPair(10, cadCoord(point.x)),
    dxfPair(20, cadCoord(point.y)),
    dxfPair(30, cadCoord(point.z)),
    dxfPair(40, cadSize(height)),
    dxfPair(1, text),
    dxfPair(50, rot.toFixed(2)),
    dxfPair(7, textStyle),
    dxfPair(72, 1),
    dxfPair(11, cadCoord(point.x)),
    dxfPair(21, cadCoord(point.y)),
    dxfPair(31, cadCoord(point.z)),
    dxfPair(100, "AcDbText"),
    dxfPair(73, 2),
  ].join("\n");
}

function entityCenteredBlockText(text: string) {
  return [
    dxfPair(0, "TEXT"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "0"),
    dxfPair(62, 7),
    dxfPair(100, "AcDbText"),
    dxfPair(10, "-0.9047619047619047"),
    dxfPair(20, "-1.0"),
    dxfPair(30, "0.0"),
    dxfPair(40, "2.0"),
    dxfPair(1, text),
    dxfPair(7, "SIMPLEX"),
    dxfPair(72, 1),
    dxfPair(11, "0.0"),
    dxfPair(21, "0.0"),
    dxfPair(31, "0.0"),
    dxfPair(100, "AcDbText"),
    dxfPair(73, 2),
  ].join("\n");
}

function entityPolyline(layer: LayerName, points: CadPoint[], closed: boolean, color?: number) {
  const header = [
    dxfPair(0, "POLYLINE"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, layer),
    ...(color !== undefined ? [dxfPair(62, color)] : []),
    dxfPair(100, "AcDb2dPolyline"),
    dxfPair(66, 1),
    dxfPair(70, closed ? 1 : 0),
  ];
  const vertices = points.flatMap((point) => [
    dxfPair(0, "VERTEX"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, layer),
    ...(color !== undefined ? [dxfPair(62, color)] : []),
    dxfPair(100, "AcDbVertex"),
    dxfPair(100, "AcDb2dVertex"),
    dxfPair(10, cadCoord(point.x)),
    dxfPair(20, cadCoord(point.y)),
    dxfPair(30, cadCoord(point.z)),
  ]);
  return [
    ...header,
    ...vertices,
    dxfPair(0, "SEQEND"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, layer),
    ...(color !== undefined ? [dxfPair(62, color)] : []),
  ].join("\n");
}

function poleMarkerEntities(center: CadPoint, standard: PoleStandard) {
  const size = standard.markerSize;
  const half = size / 2;

  if (standard.markerStyle === "circle") {
    return [entityCircle("POLES", center, half)];
  }

  if (standard.markerStyle === "square") {
    return [
      entityPolyline(
        "POLES",
        [
          { ...center, x: center.x - half, y: center.y - half },
          { ...center, x: center.x + half, y: center.y - half },
          { ...center, x: center.x + half, y: center.y + half },
          { ...center, x: center.x - half, y: center.y + half },
        ],
        true,
      ),
    ];
  }

  if (standard.markerStyle === "x") {
    return [
      entityLine("POLES", { ...center, x: center.x - half, y: center.y - half }, { ...center, x: center.x + half, y: center.y + half }),
      entityLine("POLES", { ...center, x: center.x - half, y: center.y + half }, { ...center, x: center.x + half, y: center.y - half }),
    ];
  }

  return [
    entityCircle("POLES", center, half * 0.66),
    entityLine("POLES", { ...center, x: center.x - half }, { ...center, x: center.x + half }),
    entityLine("POLES", { ...center, y: center.y - half }, { ...center, y: center.y + half }),
  ];
}

/**
 * Keep the default provider marker visually equivalent to the legacy block,
 * but emit only ordinary drawing entities.  Nested attributed blocks are a
 * common cause of AutoCAD's "Paste Invalid" clipboard error, especially when
 * the destination drawing has different attribute or block definitions.
 */
function emptyBlockDefinition(name: string) {
  return [
    dxfPair(0, "BLOCK"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "0"),
    dxfPair(100, "AcDbBlockBegin"),
    dxfPair(2, name),
    dxfPair(70, 0),
    dxfPair(10, 0),
    dxfPair(20, 0),
    dxfPair(30, 0),
    dxfPair(3, name),
    dxfPair(1, ""),
    dxfPair(0, "ENDBLK"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "0"),
    dxfPair(100, "AcDbBlockEnd"),
  ].join("\n");
}

function ptPoleBlockDefinition() {
  return [
    dxfPair(0, "BLOCK"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "0"),
    dxfPair(100, "AcDbBlockBegin"),
    dxfPair(2, "PTPOLE"),
    dxfPair(70, 2),
    dxfPair(10, 0),
    dxfPair(20, 0),
    dxfPair(30, 0),
    dxfPair(3, "PTPOLE"),
    dxfPair(1, ""),
    // Centered ATTDEF POLECODE inside circle (middle-justified 72=4, 11=0, 21=0)
    dxfPair(0, "ATTDEF"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "X-POLE"),
    dxfPair(62, 7),
    dxfPair(100, "AcDbText"),
    dxfPair(10, "0.0"),
    dxfPair(20, "0.0"),
    dxfPair(30, "0.0"),
    dxfPair(40, "2.0"),
    dxfPair(1, "G"),
    dxfPair(7, "SIMPLEX"),
    dxfPair(72, 4),
    dxfPair(11, "0.0"),
    dxfPair(21, "0.0"),
    dxfPair(31, "0.0"),
    dxfPair(100, "AcDbAttributeDefinition"),
    dxfPair(3, "POLE CODE"),
    dxfPair(2, "POLECODE"),
    dxfPair(70, 0),
    // Circle radius 1.5 on X-POLE
    dxfPair(0, "CIRCLE"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "X-POLE"),
    dxfPair(100, "AcDbCircle"),
    dxfPair(10, "0.0"),
    dxfPair(20, "0.0"),
    dxfPair(30, "0.0"),
    dxfPair(40, "1.5"),
    // ATTDEF POLNO
    dxfPair(0, "ATTDEF"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "X-POLE"),
    dxfPair(62, 7),
    dxfPair(100, "AcDbText"),
    dxfPair(10, "3.08320367"),
    dxfPair(20, "-1.01059122"),
    dxfPair(30, "0.0"),
    dxfPair(40, "2.0"),
    dxfPair(1, ""),
    dxfPair(7, "SIMPLEX"),
    dxfPair(100, "AcDbAttributeDefinition"),
    dxfPair(3, "POLE NUMBER"),
    dxfPair(2, "POLNO"),
    dxfPair(70, 0),
    // ATTDEF POLTYP
    dxfPair(0, "ATTDEF"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "X-POLE"),
    dxfPair(62, 7),
    dxfPair(100, "AcDbText"),
    dxfPair(10, "3.08320367"),
    dxfPair(20, "-4.45206223"),
    dxfPair(30, "0.0"),
    dxfPair(40, "2.0"),
    dxfPair(1, ""),
    dxfPair(7, "SIMPLEX"),
    dxfPair(100, "AcDbAttributeDefinition"),
    dxfPair(3, "POLE TYPE"),
    dxfPair(2, "POLTYP"),
    dxfPair(70, 0),
    // ATTDEF DA
    dxfPair(0, "ATTDEF"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "X-POLE"),
    dxfPair(62, 7),
    dxfPair(100, "AcDbText"),
    dxfPair(10, "3.08320367"),
    dxfPair(20, "-7.89353324"),
    dxfPair(30, "0.0"),
    dxfPair(40, "2.0"),
    dxfPair(1, ""),
    dxfPair(7, "SIMPLEX"),
    dxfPair(100, "AcDbAttributeDefinition"),
    dxfPair(3, "COORDINATES"),
    dxfPair(2, "DA"),
    dxfPair(70, 0),
    // ENDBLK
    dxfPair(0, "ENDBLK"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "0"),
    dxfPair(100, "AcDbBlockEnd"),
  ].join("\n");
}

function epoleBlockDefinition() {
  return [
    dxfPair(0, "BLOCK"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "0"),
    dxfPair(100, "AcDbBlockBegin"),
    dxfPair(2, "EPOLE"),
    dxfPair(70, 2),
    dxfPair(10, 0),
    dxfPair(20, 0),
    dxfPair(30, 0),
    dxfPair(3, "EPOLE"),
    dxfPair(1, ""),
    // ATTDEF OWNER
    dxfPair(0, "ATTDEF"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "X-POLE"),
    dxfPair(62, 7),
    dxfPair(100, "AcDbText"),
    dxfPair(10, "1.78283683"),
    dxfPair(20, "1.85000000"),
    dxfPair(30, "0.0"),
    dxfPair(40, "2.0"),
    dxfPair(1, ""),
    dxfPair(7, "SIMPLEX"),
    dxfPair(100, "AcDbAttributeDefinition"),
    dxfPair(3, "OWNER"),
    dxfPair(2, "OWNER"),
    dxfPair(70, 0),
    // ATTDEF POLNO
    dxfPair(0, "ATTDEF"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "EXPOLE"),
    dxfPair(100, "AcDbText"),
    dxfPair(10, "1.78283683"),
    dxfPair(20, "-1.03947606"),
    dxfPair(30, "0.0"),
    dxfPair(40, "2.0"),
    dxfPair(1, ""),
    dxfPair(7, "SIMPLEX"),
    dxfPair(100, "AcDbAttributeDefinition"),
    dxfPair(3, "POLE NO."),
    dxfPair(2, "POLNO"),
    dxfPair(70, 0),
    // ATTDEF TYPE
    dxfPair(0, "ATTDEF"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "X-POLE"),
    dxfPair(62, 7),
    dxfPair(100, "AcDbText"),
    dxfPair(10, "1.78283683"),
    dxfPair(20, "-4.01700000"),
    dxfPair(30, "0.0"),
    dxfPair(40, "2.0"),
    dxfPair(1, ""),
    dxfPair(7, "SIMPLEX"),
    dxfPair(100, "AcDbAttributeDefinition"),
    dxfPair(3, "POLE TYPE"),
    dxfPair(2, "TYPE"),
    dxfPair(70, 0),
    // ATTDEF DA
    dxfPair(0, "ATTDEF"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "X-POLE"),
    dxfPair(62, 7),
    dxfPair(100, "AcDbText"),
    dxfPair(10, "1.78283683"),
    dxfPair(20, "-7.06310000"),
    dxfPair(30, "0.0"),
    dxfPair(40, "2.0"),
    dxfPair(1, ""),
    dxfPair(7, "SIMPLEX"),
    dxfPair(100, "AcDbAttributeDefinition"),
    dxfPair(3, "COORDINATES"),
    dxfPair(2, "DA"),
    dxfPair(70, 0),
    // TEXT X in SIMPLEX
    dxfPair(0, "TEXT"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "EXPOLE"),
    dxfPair(62, 5),
    dxfPair(100, "AcDbText"),
    dxfPair(10, "-0.84636715"),
    dxfPair(20, "-1.26304102"),
    dxfPair(30, "0.0"),
    dxfPair(40, "2.5"),
    dxfPair(1, "X"),
    dxfPair(50, "359.17468619"),
    dxfPair(7, "SIMPLEX"),
    dxfPair(72, 4),
    dxfPair(11, "0.00488467"),
    dxfPair(21, "-0.02517399"),
    dxfPair(31, "0.0"),
    dxfPair(100, "AcDbText"),
    // CIRCLE radius 1.52096938
    dxfPair(0, "CIRCLE"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "X-MERALCO-MANILA"),
    dxfPair(48, "0.5"),
    dxfPair(370, 0),
    dxfPair(100, "AcDbCircle"),
    dxfPair(10, "0.00556917"),
    dxfPair(20, "-0.05175395"),
    dxfPair(30, "0.0"),
    dxfPair(40, "1.52096938"),
    // ENDBLK
    dxfPair(0, "ENDBLK"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "0"),
    dxfPair(100, "AcDbBlockEnd"),
  ].join("\n");
}

function pPoleBlockDefinition() {
  return [
    dxfPair(0, "BLOCK"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "0"),
    dxfPair(100, "AcDbBlockBegin"),
    dxfPair(2, "P-POLE"),
    dxfPair(70, 2),
    dxfPair(10, 0),
    dxfPair(20, 0),
    dxfPair(30, 0),
    dxfPair(3, "P-POLE"),
    dxfPair(1, ""),
    // ATTDEF POLNO
    dxfPair(0, "ATTDEF"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "0"),
    dxfPair(62, 10),
    dxfPair(100, "AcDbText"),
    dxfPair(10, "3.2102"),
    dxfPair(20, "5.8287"),
    dxfPair(30, "0.0"),
    dxfPair(40, "2.0"),
    dxfPair(1, "PROPOSED POLE"),
    dxfPair(7, "ROMANS"),
    dxfPair(100, "AcDbAttributeDefinition"),
    dxfPair(3, "POLE NUMBER"),
    dxfPair(2, "POLNO"),
    dxfPair(70, 0),
    // ATTDEF POLTYP
    dxfPair(0, "ATTDEF"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "0"),
    dxfPair(62, 10),
    dxfPair(100, "AcDbText"),
    dxfPair(10, "3.4702"),
    dxfPair(20, "2.9106"),
    dxfPair(30, "0.0"),
    dxfPair(40, "2.0"),
    dxfPair(1, "CC"),
    dxfPair(7, "ROMANS"),
    dxfPair(100, "AcDbAttributeDefinition"),
    dxfPair(3, "POLE TYPE"),
    dxfPair(2, "POLTYP"),
    dxfPair(70, 0),
    // ATTDEF POLHYT
    dxfPair(0, "ATTDEF"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "0"),
    dxfPair(62, 10),
    dxfPair(100, "AcDbText"),
    dxfPair(10, "3.1346"),
    dxfPair(20, "-0.0637"),
    dxfPair(30, "0.0"),
    dxfPair(40, "2.0"),
    dxfPair(1, "9.0m"),
    dxfPair(7, "ROMANS"),
    dxfPair(100, "AcDbAttributeDefinition"),
    dxfPair(3, "POLE HEIGHT"),
    dxfPair(2, "POLHYT"),
    dxfPair(70, 0),
    // ATTDEF COORDINATES
    dxfPair(0, "ATTDEF"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "0"),
    dxfPair(62, 10),
    dxfPair(100, "AcDbText"),
    dxfPair(10, "2.9783"),
    dxfPair(20, "-3.4928"),
    dxfPair(30, "0.0"),
    dxfPair(40, "2.0"),
    dxfPair(1, ""),
    dxfPair(7, "ROMANS"),
    dxfPair(100, "AcDbAttributeDefinition"),
    dxfPair(3, "COORDINATES"),
    dxfPair(2, "COORDINATES"),
    dxfPair(70, 0),
    // CIRCLE radius 1.25 on X-POLE Color 1
    dxfPair(0, "CIRCLE"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "X-POLE"),
    dxfPair(62, 1),
    dxfPair(100, "AcDbCircle"),
    dxfPair(10, "0.0"),
    dxfPair(20, "0.0"),
    dxfPair(30, "0.0"),
    dxfPair(40, "1.25"),
    // HATCH ANSI31 color 1 red (shaded red circle matching Stencil Template)
    dxfPair(0, "HATCH"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "X-POLE"),
    dxfPair(6, "Continuous"),
    dxfPair(62, 1),
    dxfPair(100, "AcDbHatch"),
    dxfPair(10, "0.0"),
    dxfPair(20, "0.0"),
    dxfPair(30, "0.0"),
    dxfPair(210, "0.0"),
    dxfPair(220, "0.0"),
    dxfPair(230, "1.0"),
    dxfPair(2, "ANSI31"),
    dxfPair(70, 0),
    dxfPair(71, 1),
    dxfPair(91, 1),
    dxfPair(92, 1),
    dxfPair(93, 1),
    dxfPair(72, 2),
    dxfPair(10, "0.0"),
    dxfPair(20, "0.0"),
    dxfPair(40, "1.25"),
    dxfPair(50, "0.0"),
    dxfPair(51, "360.0"),
    dxfPair(73, 1),
    dxfPair(97, 0),
    dxfPair(75, 0),
    dxfPair(76, 1),
    dxfPair(52, "0.0"),
    dxfPair(41, "1.5"),
    dxfPair(77, 0),
    dxfPair(78, 1),
    dxfPair(53, "45.0"),
    dxfPair(43, "0.0"),
    dxfPair(44, "0.0"),
    dxfPair(45, "-0.13258252"),
    dxfPair(46, "0.13258252"),
    dxfPair(79, 0),
    dxfPair(98, 1),
    dxfPair(10, "0.0"),
    dxfPair(20, "0.0"),
    // ENDBLK
    dxfPair(0, "ENDBLK"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "0"),
    dxfPair(100, "AcDbBlockEnd"),
  ].join("\n");
}

function newPldtSymbolBlockDefinition() {
  return [
    dxfPair(0, "BLOCK"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "0"),
    dxfPair(62, 6),
    dxfPair(100, "AcDbBlockBegin"),
    dxfPair(2, "NEW_PLDT_SYSMBOL"),
    dxfPair(70, 2),
    dxfPair(10, 0),
    dxfPair(20, 0),
    dxfPair(30, 0),
    dxfPair(3, "NEW_PLDT_SYSMBOL"),
    dxfPair(1, ""),
    // Solid Hatch inside circle
    dxfPair(0, "HATCH"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "POLE PLDT-SMART"),
    dxfPair(100, "AcDbHatch"),
    dxfPair(10, "0.0"),
    dxfPair(20, "0.0"),
    dxfPair(30, "0.0"),
    dxfPair(210, "0.0"),
    dxfPair(220, "0.0"),
    dxfPair(230, "1.0"),
    dxfPair(2, "SOLID"),
    dxfPair(70, 1),
    dxfPair(71, 0),
    dxfPair(91, 1),
    dxfPair(92, 7),
    dxfPair(72, 1),
    dxfPair(73, 1),
    dxfPair(93, 2),
    dxfPair(10, "1.62732461"),
    dxfPair(20, "0.0"),
    dxfPair(42, "-1.0"),
    dxfPair(10, "-1.62732461"),
    dxfPair(20, "0.0"),
    dxfPair(42, "-1.0"),
    dxfPair(97, 0),
    dxfPair(75, 1),
    dxfPair(76, 1),
    dxfPair(47, "0.02625420"),
    dxfPair(98, 1),
    dxfPair(10, "0.0"),
    dxfPair(20, "0.0"),
    // Circle radius 1.6273
    dxfPair(0, "CIRCLE"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "POLE PLDT-SMART"),
    dxfPair(100, "AcDbCircle"),
    dxfPair(10, "0.0"),
    dxfPair(20, "0.0"),
    dxfPair(30, "0.0"),
    dxfPair(40, "1.62732461"),
    // ATTDEF PLDT
    dxfPair(0, "ATTDEF"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "POLE PLDT-SMART"),
    dxfPair(100, "AcDbText"),
    dxfPair(10, "1.9500"),
    dxfPair(20, "0.8000"),
    dxfPair(30, "0.0"),
    dxfPair(40, "2.84687798"),
    dxfPair(1, "PLDT-POLE"),
    dxfPair(50, "0.0"),
    dxfPair(41, "0.7"),
    dxfPair(7, "样式 1"),
    dxfPair(100, "AcDbAttributeDefinition"),
    dxfPair(280, 0),
    dxfPair(3, ""),
    dxfPair(2, "PLDT"),
    dxfPair(70, 0),
    dxfPair(280, 0),
    // ATTDEF CC
    dxfPair(0, "ATTDEF"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "POLE PLDT-SMART"),
    dxfPair(100, "AcDbText"),
    dxfPair(10, "1.9500"),
    dxfPair(20, "-1.2000"),
    dxfPair(30, "0.0"),
    dxfPair(40, "1.61806868"),
    dxfPair(1, "Pole-Type"),
    dxfPair(50, "0.0"),
    dxfPair(41, "0.6"),
    dxfPair(7, "样式 1"),
    dxfPair(100, "AcDbAttributeDefinition"),
    dxfPair(280, 0),
    dxfPair(3, ""),
    dxfPair(2, "CC"),
    dxfPair(70, 0),
    dxfPair(280, 0),
    // ATTDEF COORDINATES
    dxfPair(0, "ATTDEF"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "POLE PLDT-SMART"),
    dxfPair(100, "AcDbText"),
    dxfPair(10, "1.9500"),
    dxfPair(20, "-2.4000"),
    dxfPair(30, "0.0"),
    dxfPair(40, "0.97084121"),
    dxfPair(1, "LONG, LAT"),
    dxfPair(50, "0.0"),
    dxfPair(41, "0.6"),
    dxfPair(7, "样式 1"),
    dxfPair(100, "AcDbAttributeDefinition"),
    dxfPair(280, 0),
    dxfPair(3, ""),
    dxfPair(2, "COORDINATES"),
    dxfPair(70, 0),
    dxfPair(280, 0),
    // ENDBLK
    dxfPair(0, "ENDBLK"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "0"),
    dxfPair(62, 6),
    dxfPair(100, "AcDbBlockEnd"),
  ].join("\n");
}

function newProposePoleSymbolBlockDefinition() {
  return [
    dxfPair(0, "BLOCK"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "0"),
    dxfPair(62, 6),
    dxfPair(100, "AcDbBlockBegin"),
    dxfPair(2, "NEW_PROPOSE POLE_SYSMBOL"),
    dxfPair(70, 2),
    dxfPair(10, 0),
    dxfPair(20, 0),
    dxfPair(30, 0),
    dxfPair(3, "NEW_PROPOSE POLE_SYSMBOL"),
    dxfPair(1, ""),
    // CIRCLE on layer 0 (Red color 1)
    dxfPair(0, "CIRCLE"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "0"),
    dxfPair(62, 1),
    dxfPair(370, 25),
    dxfPair(100, "AcDbCircle"),
    dxfPair(10, "0.0"),
    dxfPair(20, "0.0"),
    dxfPair(30, "0.0"),
    dxfPair(40, "1.62732461"),
    // ATTDEF PROPOSED-POLE
    dxfPair(0, "ATTDEF"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "schematic co"),
    dxfPair(62, 1),
    dxfPair(100, "AcDbText"),
    dxfPair(10, "2.0000"),
    dxfPair(20, "0.8000"),
    dxfPair(30, "0.0"),
    dxfPair(40, "1.93587826"),
    dxfPair(1, "Proposed Pole"),
    dxfPair(50, "0.0"),
    dxfPair(41, "0.8"),
    dxfPair(7, "样式 1"),
    dxfPair(100, "AcDbAttributeDefinition"),
    dxfPair(280, 0),
    dxfPair(3, ""),
    dxfPair(2, "PROPOSED-POLE"),
    dxfPair(70, 0),
    dxfPair(280, 0),
    // ATTDEF SIZE
    dxfPair(0, "ATTDEF"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "schematic co"),
    dxfPair(62, 1),
    dxfPair(100, "AcDbText"),
    dxfPair(10, "2.0000"),
    dxfPair(20, "-2.1500"),
    dxfPair(30, "0.0"),
    dxfPair(40, "1.93587826"),
    dxfPair(1, "7.5m"),
    dxfPair(50, "0.0"),
    dxfPair(41, "0.8"),
    dxfPair(7, "样式 1"),
    dxfPair(100, "AcDbAttributeDefinition"),
    dxfPair(280, 0),
    dxfPair(3, ""),
    dxfPair(2, "SIZE"),
    dxfPair(70, 0),
    dxfPair(280, 0),
    // ATTDEF COORDINATES on schematic co
    dxfPair(0, "ATTDEF"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "schematic co"),
    dxfPair(62, 1),
    dxfPair(100, "AcDbText"),
    dxfPair(10, "2.0000"),
    dxfPair(20, "-5.1000"),
    dxfPair(30, "0.0"),
    dxfPair(40, "1.93587826"),
    dxfPair(1, "LONG, LAT"),
    dxfPair(50, "0.0"),
    dxfPair(41, "0.8"),
    dxfPair(7, "样式 1"),
    dxfPair(100, "AcDbAttributeDefinition"),
    dxfPair(280, 0),
    dxfPair(3, ""),
    dxfPair(2, "COORDINATES"),
    dxfPair(70, 0),
    dxfPair(280, 0),
    // ENDBLK
    dxfPair(0, "ENDBLK"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "0"),
    dxfPair(62, 6),
    dxfPair(100, "AcDbBlockEnd"),
  ].join("\n");
}

function newElectricSymbolBlockDefinition() {
  return [
    dxfPair(0, "BLOCK"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "0"),
    dxfPair(62, 6),
    dxfPair(100, "AcDbBlockBegin"),
    dxfPair(2, "NEW_ELECTRIC_SYSMBOL"),
    dxfPair(70, 2),
    dxfPair(10, 0),
    dxfPair(20, 0),
    dxfPair(30, 0),
    dxfPair(3, "NEW_ELECTRIC_SYSMBOL"),
    dxfPair(1, ""),
    // LWPOLYLINE 1 (45-deg diagonal 1)
    dxfPair(0, "LWPOLYLINE"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "ELECTRIC POLE"),
    dxfPair(100, "AcDbPolyline"),
    dxfPair(90, 2),
    dxfPair(70, 0),
    dxfPair(43, "0.61072840"),
    dxfPair(10, "-1.19092000"),
    dxfPair(20, "-1.19092000"),
    dxfPair(10, "1.19092000"),
    dxfPair(20, "1.19092000"),
    // LWPOLYLINE 2 (45-deg diagonal 2)
    dxfPair(0, "LWPOLYLINE"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "ELECTRIC POLE"),
    dxfPair(100, "AcDbPolyline"),
    dxfPair(90, 2),
    dxfPair(70, 0),
    dxfPair(43, "0.61072840"),
    dxfPair(10, "-1.19092000"),
    dxfPair(20, "1.19092000"),
    dxfPair(10, "1.19092000"),
    dxfPair(20, "-1.19092000"),
    // ATTDEF EP
    dxfPair(0, "ATTDEF"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "ELECTRIC POLE"),
    dxfPair(100, "AcDbText"),
    dxfPair(10, "1.9500"),
    dxfPair(20, "0.8000"),
    dxfPair(30, "0.0"),
    dxfPair(40, "2.93582726"),
    dxfPair(1, "EP"),
    dxfPair(50, "0.0"),
    dxfPair(7, "样式 1"),
    dxfPair(100, "AcDbAttributeDefinition"),
    dxfPair(280, 0),
    dxfPair(3, "EP"),
    dxfPair(2, "EP"),
    dxfPair(70, 0),
    dxfPair(280, 0),
    // ATTDEF CC
    dxfPair(0, "ATTDEF"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "ELECTRIC POLE"),
    dxfPair(100, "AcDbText"),
    dxfPair(10, "1.9500"),
    dxfPair(20, "-1.2000"),
    dxfPair(30, "0.0"),
    dxfPair(40, "1.83489204"),
    dxfPair(1, "CC"),
    dxfPair(50, "0.0"),
    dxfPair(7, "样式 1"),
    dxfPair(100, "AcDbAttributeDefinition"),
    dxfPair(280, 0),
    dxfPair(3, "CC"),
    dxfPair(2, "CC"),
    dxfPair(70, 0),
    dxfPair(280, 0),
    // ATTDEF COORDINATES
    dxfPair(0, "ATTDEF"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "ELECTRIC POLE"),
    dxfPair(100, "AcDbText"),
    dxfPair(10, "1.9500"),
    dxfPair(20, "-2.4000"),
    dxfPair(30, "0.0"),
    dxfPair(40, "0.91744602"),
    dxfPair(1, "LONG, LAT"),
    dxfPair(50, "0.0"),
    dxfPair(7, "样式 1"),
    dxfPair(100, "AcDbAttributeDefinition"),
    dxfPair(280, 0),
    dxfPair(3, "COORDINATES"),
    dxfPair(2, "COORDINATES"),
    dxfPair(70, 0),
    dxfPair(280, 0),
    // ENDBLK
    dxfPair(0, "ENDBLK"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "0"),
    dxfPair(62, 6),
    dxfPair(100, "AcDbBlockEnd"),
  ].join("\n");
}

function globeNapProposedBlockDefinition(
  name = "GLOBE NAP PROPOSED",
  layer: LayerName = "NEW NAP",
  attribLayer: LayerName = "p-mh",
  color = 1,
) {
  return [
    dxfPair(0, "BLOCK"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "0"),
    dxfPair(100, "AcDbBlockBegin"),
    dxfPair(2, name),
    dxfPair(70, 2),
    dxfPair(10, 0),
    dxfPair(20, 0),
    dxfPair(30, 0),
    dxfPair(3, name),
    dxfPair(1, ""),
    // Top frame line
    dxfPair(0, "LINE"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, layer),
    dxfPair(62, color),
    dxfPair(100, "AcDbLine"),
    dxfPair(10, "-1.2728"),
    dxfPair(20, "2.5133"),
    dxfPair(30, "0.0"),
    dxfPair(11, "1.6758"),
    dxfPair(21, "2.5133"),
    dxfPair(31, "0.0"),
    // Bottom frame line
    dxfPair(0, "LINE"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, layer),
    dxfPair(62, color),
    dxfPair(100, "AcDbLine"),
    dxfPair(10, "1.6758"),
    dxfPair(20, "-2.5133"),
    dxfPair(30, "0.0"),
    dxfPair(11, "-1.2728"),
    dxfPair(21, "-2.5133"),
    dxfPair(31, "0.0"),
    // Left frame line
    dxfPair(0, "LINE"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, layer),
    dxfPair(62, color),
    dxfPair(100, "AcDbLine"),
    dxfPair(10, "-1.2728"),
    dxfPair(20, "-2.5133"),
    dxfPair(30, "0.0"),
    dxfPair(11, "-1.2728"),
    dxfPair(21, "2.5133"),
    dxfPair(31, "0.0"),
    // Right Dome Ellipse
    dxfPair(0, "ELLIPSE"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, layer),
    dxfPair(62, color),
    dxfPair(100, "AcDbEllipse"),
    dxfPair(10, "0.9981"),
    dxfPair(20, "0.0"),
    dxfPair(30, "0.0"),
    dxfPair(11, "3.7034"),
    dxfPair(21, "0.0"),
    dxfPair(31, "0.0"),
    dxfPair(210, "0.0"),
    dxfPair(220, "0.0"),
    dxfPair(230, "1.0"),
    dxfPair(40, "0.6903"),
    dxfPair(41, "4.8964"),
    dxfPair(42, "7.6700"),
    // Internal triangle mounting
    dxfPair(0, "LWPOLYLINE"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, layer),
    dxfPair(62, color),
    dxfPair(100, "AcDbPolyline"),
    dxfPair(90, 4),
    dxfPair(70, 1),
    dxfPair(10, "-1.2728"),
    dxfPair(20, "0.0"),
    dxfPair(10, "0.0"),
    dxfPair(20, "-1.2728"),
    dxfPair(10, "0.0"),
    dxfPair(20, "1.2728"),
    dxfPair(10, "-1.2728"),
    dxfPair(20, "0.0"),
    // Port 1 line (centered in triangle)
    dxfPair(0, "LWPOLYLINE"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, layer),
    dxfPair(62, color),
    dxfPair(100, "AcDbPolyline"),
    dxfPair(90, 2),
    dxfPair(70, 0),
    dxfPair(10, "0.0"),
    dxfPair(20, "0.8718"),
    dxfPair(10, "1.6758"),
    dxfPair(20, "0.8718"),
    // Port 2 line (centered in triangle)
    dxfPair(0, "LWPOLYLINE"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, layer),
    dxfPair(62, color),
    dxfPair(100, "AcDbPolyline"),
    dxfPair(90, 2),
    dxfPair(70, 0),
    dxfPair(10, "0.0"),
    dxfPair(20, "0.2906"),
    dxfPair(10, "1.6758"),
    dxfPair(20, "0.2906"),
    // Port 3 line (centered in triangle)
    dxfPair(0, "LWPOLYLINE"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, layer),
    dxfPair(62, color),
    dxfPair(100, "AcDbPolyline"),
    dxfPair(90, 2),
    dxfPair(70, 0),
    dxfPair(10, "0.0"),
    dxfPair(20, "-0.2906"),
    dxfPair(10, "1.6758"),
    dxfPair(20, "-0.2906"),
    // Port 4 line (centered in triangle)
    dxfPair(0, "LWPOLYLINE"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, layer),
    dxfPair(62, color),
    dxfPair(100, "AcDbPolyline"),
    dxfPair(90, 2),
    dxfPair(70, 0),
    dxfPair(10, "0.0"),
    dxfPair(20, "-0.8718"),
    dxfPair(10, "1.6758"),
    dxfPair(20, "-0.8718"),
    // ATTDEF MHTYPE (NAP ID)
    dxfPair(0, "ATTDEF"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, attribLayer),
    dxfPair(62, color),
    dxfPair(100, "AcDbText"),
    dxfPair(10, "-3.8816"),
    dxfPair(20, "3.0247"),
    dxfPair(30, "0.0"),
    dxfPair(40, "1.65"),
    dxfPair(1, "TYPE I"),
    dxfPair(7, "SIMPLEX"),
    dxfPair(72, 1),
    dxfPair(11, "-0.0713"),
    dxfPair(21, "2.4748"),
    dxfPair(31, "0.0"),
    dxfPair(100, "AcDbAttributeDefinition"),
    dxfPair(280, 0),
    dxfPair(3, "MANHOLE TYPE"),
    dxfPair(2, "MHTYPE"),
    dxfPair(70, 0),
    dxfPair(74, 1),
    dxfPair(280, 0),
    // ATTDEF MHNO (NAP AUGMENT / Loop)
    dxfPair(0, "ATTDEF"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, attribLayer),
    dxfPair(62, color),
    dxfPair(100, "AcDbText"),
    dxfPair(10, "-6.7884"),
    dxfPair(20, "5.4994"),
    dxfPair(30, "0.0"),
    dxfPair(40, "1.65"),
    dxfPair(1, "MH 100100"),
    dxfPair(7, "SIMPLEX"),
    dxfPair(72, 1),
    dxfPair(11, "-0.0713"),
    dxfPair(21, "4.9495"),
    dxfPair(31, "0.0"),
    dxfPair(100, "AcDbAttributeDefinition"),
    dxfPair(280, 0),
    dxfPair(3, "MANHOLE NUMBEER"),
    dxfPair(2, "MHNO"),
    dxfPair(70, 0),
    dxfPair(74, 1),
    dxfPair(280, 0),
    // ENDBLK
    dxfPair(0, "ENDBLK"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "0"),
    dxfPair(100, "AcDbBlockEnd"),
  ].join("\n");
}

function globeNap8LinesBlockDefinition(
  name = "GLOBE NAP 8-LINES",
  layer: LayerName = "NEW NAP",
  attribLayer: LayerName = "p-mh",
  color = 1,
) {
  return [
    dxfPair(0, "BLOCK"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "0"),
    dxfPair(100, "AcDbBlockBegin"),
    dxfPair(2, name),
    dxfPair(70, 2),
    dxfPair(10, 0),
    dxfPair(20, 0),
    dxfPair(30, 0),
    dxfPair(3, name),
    dxfPair(1, ""),
    // Top frame line
    dxfPair(0, "LINE"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, layer),
    dxfPair(62, color),
    dxfPair(100, "AcDbLine"),
    dxfPair(10, "-1.2728"),
    dxfPair(20, "2.5133"),
    dxfPair(30, "0.0"),
    dxfPair(11, "1.6758"),
    dxfPair(21, "2.5133"),
    dxfPair(31, "0.0"),
    // Bottom frame line
    dxfPair(0, "LINE"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, layer),
    dxfPair(62, color),
    dxfPair(100, "AcDbLine"),
    dxfPair(10, "1.6758"),
    dxfPair(20, "-2.5133"),
    dxfPair(30, "0.0"),
    dxfPair(11, "-1.2728"),
    dxfPair(21, "-2.5133"),
    dxfPair(31, "0.0"),
    // Left frame line
    dxfPair(0, "LINE"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, layer),
    dxfPair(62, color),
    dxfPair(100, "AcDbLine"),
    dxfPair(10, "-1.2728"),
    dxfPair(20, "-2.5133"),
    dxfPair(30, "0.0"),
    dxfPair(11, "-1.2728"),
    dxfPair(21, "2.5133"),
    dxfPair(31, "0.0"),
    // Right Dome Ellipse
    dxfPair(0, "ELLIPSE"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, layer),
    dxfPair(62, color),
    dxfPair(100, "AcDbEllipse"),
    dxfPair(10, "0.9981"),
    dxfPair(20, "0.0"),
    dxfPair(30, "0.0"),
    dxfPair(11, "3.7034"),
    dxfPair(21, "0.0"),
    dxfPair(31, "0.0"),
    dxfPair(210, "0.0"),
    dxfPair(220, "0.0"),
    dxfPair(230, "1.0"),
    dxfPair(40, "0.6903"),
    dxfPair(41, "4.8964"),
    dxfPair(42, "7.6700"),
    // Top internal triangle mounting
    dxfPair(0, "LWPOLYLINE"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, layer),
    dxfPair(62, color),
    dxfPair(100, "AcDbPolyline"),
    dxfPair(90, 4),
    dxfPair(70, 1),
    dxfPair(10, "-1.2728"),
    dxfPair(20, "1.2405"),
    dxfPair(10, "0.0"),
    dxfPair(20, "-0.0323"),
    dxfPair(10, "0.0"),
    dxfPair(20, "2.5133"),
    dxfPair(10, "-1.2728"),
    dxfPair(20, "1.2405"),
    // Top Port 1 line
    dxfPair(0, "LWPOLYLINE"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, layer),
    dxfPair(62, color),
    dxfPair(100, "AcDbPolyline"),
    dxfPair(90, 2),
    dxfPair(70, 0),
    dxfPair(10, "0.0"),
    dxfPair(20, "2.1629"),
    dxfPair(10, "1.6758"),
    dxfPair(20, "2.1629"),
    // Top Port 2 line
    dxfPair(0, "LWPOLYLINE"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, layer),
    dxfPair(62, color),
    dxfPair(100, "AcDbPolyline"),
    dxfPair(90, 2),
    dxfPair(70, 0),
    dxfPair(10, "0.0"),
    dxfPair(20, "1.5847"),
    dxfPair(10, "1.6758"),
    dxfPair(20, "1.5847"),
    // Top Port 3 line
    dxfPair(0, "LWPOLYLINE"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, layer),
    dxfPair(62, color),
    dxfPair(100, "AcDbPolyline"),
    dxfPair(90, 2),
    dxfPair(70, 0),
    dxfPair(10, "0.0"),
    dxfPair(20, "0.9808"),
    dxfPair(10, "1.6758"),
    dxfPair(20, "0.9808"),
    // Top Port 4 line
    dxfPair(0, "LWPOLYLINE"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, layer),
    dxfPair(62, color),
    dxfPair(100, "AcDbPolyline"),
    dxfPair(90, 2),
    dxfPair(70, 0),
    dxfPair(10, "0.0"),
    dxfPair(20, "0.4226"),
    dxfPair(10, "1.6758"),
    dxfPair(20, "0.4226"),
    // Bottom internal triangle mounting
    dxfPair(0, "LWPOLYLINE"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, layer),
    dxfPair(62, color),
    dxfPair(100, "AcDbPolyline"),
    dxfPair(90, 4),
    dxfPair(70, 1),
    dxfPair(10, "-1.2728"),
    dxfPair(20, "-1.2405"),
    dxfPair(10, "0.0"),
    dxfPair(20, "-2.5133"),
    dxfPair(10, "0.0"),
    dxfPair(20, "0.0323"),
    dxfPair(10, "-1.2728"),
    dxfPair(20, "-1.2405"),
    // Bottom Port 5 line
    dxfPair(0, "LWPOLYLINE"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, layer),
    dxfPair(62, color),
    dxfPair(100, "AcDbPolyline"),
    dxfPair(90, 2),
    dxfPair(70, 0),
    dxfPair(10, "0.0"),
    dxfPair(20, "-0.3181"),
    dxfPair(10, "1.6758"),
    dxfPair(20, "-0.3181"),
    // Bottom Port 6 line
    dxfPair(0, "LWPOLYLINE"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, layer),
    dxfPair(62, color),
    dxfPair(100, "AcDbPolyline"),
    dxfPair(90, 2),
    dxfPair(70, 0),
    dxfPair(10, "0.0"),
    dxfPair(20, "-0.8964"),
    dxfPair(10, "1.6758"),
    dxfPair(20, "-0.8964"),
    // Bottom Port 7 line
    dxfPair(0, "LWPOLYLINE"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, layer),
    dxfPair(62, color),
    dxfPair(100, "AcDbPolyline"),
    dxfPair(90, 2),
    dxfPair(70, 0),
    dxfPair(10, "0.0"),
    dxfPair(20, "-1.5002"),
    dxfPair(10, "1.6758"),
    dxfPair(20, "-1.5002"),
    // Bottom Port 8 line
    dxfPair(0, "LWPOLYLINE"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, layer),
    dxfPair(62, color),
    dxfPair(100, "AcDbPolyline"),
    dxfPair(90, 2),
    dxfPair(70, 0),
    dxfPair(10, "0.0"),
    dxfPair(20, "-2.0585"),
    dxfPair(10, "1.6758"),
    dxfPair(20, "-2.0585"),
    // ATTDEF MHTYPE (NAP ID)
    dxfPair(0, "ATTDEF"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, attribLayer),
    dxfPair(62, color),
    dxfPair(100, "AcDbText"),
    dxfPair(10, "-3.8816"),
    dxfPair(20, "3.0247"),
    dxfPair(30, "0.0"),
    dxfPair(40, "1.65"),
    dxfPair(1, "TYPE I"),
    dxfPair(7, "SIMPLEX"),
    dxfPair(72, 1),
    dxfPair(11, "-0.0713"),
    dxfPair(21, "2.4748"),
    dxfPair(31, "0.0"),
    dxfPair(100, "AcDbAttributeDefinition"),
    dxfPair(280, 0),
    dxfPair(3, "MANHOLE TYPE"),
    dxfPair(2, "MHTYPE"),
    dxfPair(70, 0),
    dxfPair(74, 1),
    dxfPair(280, 0),
    // ATTDEF MHNO (NAP AUGMENT / Splitter)
    dxfPair(0, "ATTDEF"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, attribLayer),
    dxfPair(62, color),
    dxfPair(100, "AcDbText"),
    dxfPair(10, "-6.7884"),
    dxfPair(20, "5.4994"),
    dxfPair(30, "0.0"),
    dxfPair(40, "1.65"),
    dxfPair(1, "MH 100100"),
    dxfPair(7, "SIMPLEX"),
    dxfPair(72, 1),
    dxfPair(11, "-0.0713"),
    dxfPair(21, "4.9495"),
    dxfPair(31, "0.0"),
    dxfPair(100, "AcDbAttributeDefinition"),
    dxfPair(280, 0),
    dxfPair(3, "MANHOLE NUMBEER"),
    dxfPair(2, "MHNO"),
    dxfPair(70, 0),
    dxfPair(74, 1),
    dxfPair(280, 0),
    // ENDBLK
    dxfPair(0, "ENDBLK"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "0"),
    dxfPair(100, "AcDbBlockEnd"),
  ].join("\n");
}

function globeNapExistingBlockDefinition(name = "GLOBE NAP EXISTING") {
  return globeNapProposedBlockDefinition(name, "EXISTING NAP", "EXISTING NAP", 5);
}

function globeNap8LinesExistingBlockDefinition(name = "GLOBE NAP 8-LINES EXISTING") {
  return globeNap8LinesBlockDefinition(name, "EXISTING NAP", "EXISTING NAP", 5);
}

function globeNapDummyBlockDefinition(
  name = "GLOBE NAP DUMMY",
  layer: LayerName = "DUMMY NAP",
  color = 1,
) {
  return [
    dxfPair(0, "BLOCK"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "0"),
    dxfPair(100, "AcDbBlockBegin"),
    dxfPair(2, name),
    dxfPair(70, 2),
    dxfPair(10, 0),
    dxfPair(20, 0),
    dxfPair(30, 0),
    dxfPair(3, name),
    dxfPair(1, ""),
    // Top frame line
    dxfPair(0, "LINE"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, layer),
    dxfPair(62, color),
    dxfPair(100, "AcDbLine"),
    dxfPair(10, "-1.2728"),
    dxfPair(20, "2.5133"),
    dxfPair(30, "0.0"),
    dxfPair(11, "1.6758"),
    dxfPair(21, "2.5133"),
    dxfPair(31, "0.0"),
    // Bottom frame line
    dxfPair(0, "LINE"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, layer),
    dxfPair(62, color),
    dxfPair(100, "AcDbLine"),
    dxfPair(10, "1.6758"),
    dxfPair(20, "-2.5133"),
    dxfPair(30, "0.0"),
    dxfPair(11, "-1.2728"),
    dxfPair(21, "-2.5133"),
    dxfPair(31, "0.0"),
    // Left frame line
    dxfPair(0, "LINE"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, layer),
    dxfPair(62, color),
    dxfPair(100, "AcDbLine"),
    dxfPair(10, "-1.2728"),
    dxfPair(20, "-2.5133"),
    dxfPair(30, "0.0"),
    dxfPair(11, "-1.2728"),
    dxfPair(21, "2.5133"),
    dxfPair(31, "0.0"),
    // Right Dome Ellipse (clean D-stencil outline: no ports, no triangle)
    dxfPair(0, "ELLIPSE"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, layer),
    dxfPair(62, color),
    dxfPair(100, "AcDbEllipse"),
    dxfPair(10, "0.9981"),
    dxfPair(20, "0.0"),
    dxfPair(30, "0.0"),
    dxfPair(11, "3.7034"),
    dxfPair(21, "0.0"),
    dxfPair(31, "0.0"),
    dxfPair(210, "0.0"),
    dxfPair(220, "0.0"),
    dxfPair(230, "1.0"),
    dxfPair(40, "0.6903"),
    dxfPair(41, "4.8964"),
    dxfPair(42, "7.6700"),
    // ATTDEF MHTYPE (NAP ID)
    dxfPair(0, "ATTDEF"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, layer),
    dxfPair(62, color),
    dxfPair(100, "AcDbText"),
    dxfPair(10, "-3.8816"),
    dxfPair(20, "3.0247"),
    dxfPair(30, "0.0"),
    dxfPair(40, "1.65"),
    dxfPair(1, "TYPE I"),
    dxfPair(7, "SIMPLEX"),
    dxfPair(72, 1),
    dxfPair(11, "-0.0713"),
    dxfPair(21, "2.4748"),
    dxfPair(31, "0.0"),
    dxfPair(100, "AcDbAttributeDefinition"),
    dxfPair(280, 0),
    dxfPair(3, "MANHOLE TYPE"),
    dxfPair(2, "MHTYPE"),
    dxfPair(70, 0),
    dxfPair(74, 1),
    dxfPair(280, 0),
    // ATTDEF MHNO (NAP AUGMENT / Splitter)
    dxfPair(0, "ATTDEF"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, layer),
    dxfPair(62, color),
    dxfPair(100, "AcDbText"),
    dxfPair(10, "-6.7884"),
    dxfPair(20, "5.4994"),
    dxfPair(30, "0.0"),
    dxfPair(40, "1.65"),
    dxfPair(1, "MH 100100"),
    dxfPair(7, "SIMPLEX"),
    dxfPair(72, 1),
    dxfPair(11, "-0.0713"),
    dxfPair(21, "4.9495"),
    dxfPair(31, "0.0"),
    dxfPair(100, "AcDbAttributeDefinition"),
    dxfPair(280, 0),
    dxfPair(3, "MANHOLE NUMBEER"),
    dxfPair(2, "MHNO"),
    dxfPair(70, 0),
    dxfPair(74, 1),
    dxfPair(280, 0),
    // ENDBLK
    dxfPair(0, "ENDBLK"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "0"),
    dxfPair(100, "AcDbBlockEnd"),
  ].join("\n");
}

function globeNapDummyExistingBlockDefinition(name = "GLOBE NAP DUMMY EXISTING") {
  return globeNapDummyBlockDefinition(name, "EXISTING NAP", 5);
}

function napGlobeBlockDefinition() {
  return [
    dxfPair(0, "BLOCK"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "0"),
    dxfPair(100, "AcDbBlockBegin"),
    dxfPair(2, "NAP_GLOBE_STENCIL"),
    dxfPair(70, 2),
    dxfPair(10, 0),
    dxfPair(20, 0),
    dxfPair(30, 0),
    dxfPair(3, "NAP_GLOBE_STENCIL"),
    dxfPair(1, ""),
    // Outer enclosure rectangular frame
    dxfPair(0, "LWPOLYLINE"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "NAP_STENCIL"),
    dxfPair(62, 3),
    dxfPair(100, "AcDbPolyline"),
    dxfPair(90, 4),
    dxfPair(70, 1),
    dxfPair(10, "-1.5"),
    dxfPair(20, "-1.0"),
    dxfPair(10, "1.5"),
    dxfPair(20, "-1.0"),
    dxfPair(10, "1.5"),
    dxfPair(20, "1.0"),
    dxfPair(10, "-1.5"),
    dxfPair(20, "1.0"),
    // Inner Splitter circle
    dxfPair(0, "CIRCLE"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "NAP_STENCIL"),
    dxfPair(62, 3),
    dxfPair(100, "AcDbCircle"),
    dxfPair(10, "0.0"),
    dxfPair(20, "0.0"),
    dxfPair(30, "0.0"),
    dxfPair(40, "0.6"),
    // Splitter marker text
    dxfPair(0, "TEXT"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "NAP_STENCIL"),
    dxfPair(62, 3),
    dxfPair(100, "AcDbText"),
    dxfPair(10, "0.0"),
    dxfPair(20, "0.0"),
    dxfPair(30, "0.0"),
    dxfPair(40, "0.65"),
    dxfPair(1, "S"),
    dxfPair(7, "SIMPLEX"),
    dxfPair(72, 4),
    dxfPair(11, "0.0"),
    dxfPair(21, "0.0"),
    dxfPair(31, "0.0"),
    dxfPair(100, "AcDbText"),
    // ATTDEF NAP_ID
    dxfPair(0, "ATTDEF"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "NAP_LABELS"),
    dxfPair(62, 2),
    dxfPair(100, "AcDbText"),
    dxfPair(10, "2.2"),
    dxfPair(20, "0.8"),
    dxfPair(30, "0.0"),
    dxfPair(40, "1.5"),
    dxfPair(1, "NAP-01"),
    dxfPair(7, "SIMPLEX"),
    dxfPair(100, "AcDbAttributeDefinition"),
    dxfPair(3, "NAP IDENTIFIER"),
    dxfPair(2, "NAP_ID"),
    dxfPair(70, 0),
    // ATTDEF SPLITTER
    dxfPair(0, "ATTDEF"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "NAP_LABELS"),
    dxfPair(62, 2),
    dxfPair(100, "AcDbText"),
    dxfPair(10, "2.2"),
    dxfPair(20, "-0.7"),
    dxfPair(30, "0.0"),
    dxfPair(40, "1.2"),
    dxfPair(1, "1:8"),
    dxfPair(7, "SIMPLEX"),
    dxfPair(100, "AcDbAttributeDefinition"),
    dxfPair(3, "SPLITTER RATIO"),
    dxfPair(2, "SPLITTER"),
    dxfPair(70, 0),
    // ATTDEF POLE_TAG
    dxfPair(0, "ATTDEF"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "NAP_LABELS"),
    dxfPair(62, 7),
    dxfPair(100, "AcDbText"),
    dxfPair(10, "2.2"),
    dxfPair(20, "-2.0"),
    dxfPair(30, "0.0"),
    dxfPair(40, "1.0"),
    dxfPair(1, "PT-01"),
    dxfPair(7, "SIMPLEX"),
    dxfPair(100, "AcDbAttributeDefinition"),
    dxfPair(3, "POLE REFERENCE"),
    dxfPair(2, "POLE_TAG"),
    dxfPair(70, 0),
    // ATTDEF COORDINATES
    dxfPair(0, "ATTDEF"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "NAP_LABELS"),
    dxfPair(62, 8),
    dxfPair(100, "AcDbText"),
    dxfPair(10, "2.2"),
    dxfPair(20, "-3.1"),
    dxfPair(30, "0.0"),
    dxfPair(40, "0.85"),
    dxfPair(1, "0.000000, 0.000000"),
    dxfPair(7, "SIMPLEX"),
    dxfPair(100, "AcDbAttributeDefinition"),
    dxfPair(3, "COORDINATES"),
    dxfPair(2, "COORDINATES"),
    dxfPair(70, 0),
    // ENDBLK
    dxfPair(0, "ENDBLK"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "0"),
    dxfPair(100, "AcDbBlockEnd"),
  ].join("\n");
}

function newPldtNapSymbolBlockDefinition() {
  return [
    dxfPair(0, "BLOCK"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "0"),
    dxfPair(100, "AcDbBlockBegin"),
    dxfPair(2, "NEW_PLDT_NAP_SYMBOL"),
    dxfPair(70, 2),
    dxfPair(10, 0),
    dxfPair(20, 0),
    dxfPair(30, 0),
    dxfPair(3, "NEW_PLDT_NAP_SYMBOL"),
    dxfPair(1, ""),
    // Outer Diamond frame
    dxfPair(0, "LWPOLYLINE"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "NAP_STENCIL"),
    dxfPair(62, 1),
    dxfPair(100, "AcDbPolyline"),
    dxfPair(90, 4),
    dxfPair(70, 1),
    dxfPair(10, "0.0"),
    dxfPair(20, "1.4"),
    dxfPair(10, "1.4"),
    dxfPair(20, "0.0"),
    dxfPair(10, "0.0"),
    dxfPair(20, "-1.4"),
    dxfPair(10, "-1.4"),
    dxfPair(20, "0.0"),
    // Inner Square frame
    dxfPair(0, "LWPOLYLINE"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "NAP_STENCIL"),
    dxfPair(62, 1),
    dxfPair(100, "AcDbPolyline"),
    dxfPair(90, 4),
    dxfPair(70, 1),
    dxfPair(10, "-0.7"),
    dxfPair(20, "-0.7"),
    dxfPair(10, "0.7"),
    dxfPair(20, "-0.7"),
    dxfPair(10, "0.7"),
    dxfPair(20, "0.7"),
    dxfPair(10, "-0.7"),
    dxfPair(20, "0.7"),
    // ATTDEF PLDT_NAP
    dxfPair(0, "ATTDEF"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "NAP_LABELS"),
    dxfPair(62, 2),
    dxfPair(100, "AcDbText"),
    dxfPair(10, "2.2"),
    dxfPair(20, "0.8"),
    dxfPair(30, "0.0"),
    dxfPair(40, "1.5"),
    dxfPair(1, "PLDT-NAP-01"),
    dxfPair(7, "SIMPLEX"),
    dxfPair(100, "AcDbAttributeDefinition"),
    dxfPair(3, "PLDT NAP IDENTIFIER"),
    dxfPair(2, "PLDT_NAP"),
    dxfPair(70, 0),
    // ATTDEF SPLITTER
    dxfPair(0, "ATTDEF"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "NAP_LABELS"),
    dxfPair(62, 2),
    dxfPair(100, "AcDbText"),
    dxfPair(10, "2.2"),
    dxfPair(20, "-0.7"),
    dxfPair(30, "0.0"),
    dxfPair(40, "1.2"),
    dxfPair(1, "1:8"),
    dxfPair(7, "SIMPLEX"),
    dxfPair(100, "AcDbAttributeDefinition"),
    dxfPair(3, "SPLITTER RATIO"),
    dxfPair(2, "SPLITTER"),
    dxfPair(70, 0),
    // ATTDEF POLE_TAG
    dxfPair(0, "ATTDEF"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "NAP_LABELS"),
    dxfPair(62, 7),
    dxfPair(100, "AcDbText"),
    dxfPair(10, "2.2"),
    dxfPair(20, "-2.0"),
    dxfPair(30, "0.0"),
    dxfPair(40, "1.0"),
    dxfPair(1, "P-01"),
    dxfPair(7, "SIMPLEX"),
    dxfPair(100, "AcDbAttributeDefinition"),
    dxfPair(3, "POLE REFERENCE"),
    dxfPair(2, "POLE_TAG"),
    dxfPair(70, 0),
    // ATTDEF COORDINATES
    dxfPair(0, "ATTDEF"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "NAP_LABELS"),
    dxfPair(62, 8),
    dxfPair(100, "AcDbText"),
    dxfPair(10, "2.2"),
    dxfPair(20, "-3.1"),
    dxfPair(30, "0.0"),
    dxfPair(40, "0.85"),
    dxfPair(1, "0.000000, 0.000000"),
    dxfPair(7, "SIMPLEX"),
    dxfPair(100, "AcDbAttributeDefinition"),
    dxfPair(3, "COORDINATES"),
    dxfPair(2, "COORDINATES"),
    dxfPair(70, 0),
    // ENDBLK
    dxfPair(0, "ENDBLK"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "0"),
    dxfPair(100, "AcDbBlockEnd"),
  ].join("\n");
}

function napBox8pBlockDefinition() {
  return [
    dxfPair(0, "BLOCK"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "0"),
    dxfPair(100, "AcDbBlockBegin"),
    dxfPair(2, "NAP_8PORT"),
    dxfPair(70, 2),
    dxfPair(10, 0),
    dxfPair(20, 0),
    dxfPair(30, 0),
    dxfPair(3, "NAP_8PORT"),
    dxfPair(1, ""),
    // 8-Port Box
    dxfPair(0, "LWPOLYLINE"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "NAP_STENCIL"),
    dxfPair(62, 4),
    dxfPair(100, "AcDbPolyline"),
    dxfPair(90, 4),
    dxfPair(70, 1),
    dxfPair(10, "-1.6"),
    dxfPair(20, "-1.2"),
    dxfPair(10, "1.6"),
    dxfPair(20, "-1.2"),
    dxfPair(10, "1.6"),
    dxfPair(20, "1.2"),
    dxfPair(10, "-1.6"),
    dxfPair(20, "1.2"),
    // 8 Port Circle Indicators
    ...[-1.2, -0.8, -0.4, 0.0, 0.4, 0.8, 1.2].flatMap((x) => [
      dxfPair(0, "CIRCLE"),
      dxfPair(5, dxfHandle()),
      dxfPair(100, "AcDbEntity"),
      dxfPair(8, "NAP_STENCIL"),
      dxfPair(62, 4),
      dxfPair(100, "AcDbCircle"),
      dxfPair(10, x.toString()),
      dxfPair(20, "-0.7"),
      dxfPair(30, "0.0"),
      dxfPair(40, "0.15"),
    ]),
    // ATTDEF NAP_ID
    dxfPair(0, "ATTDEF"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "NAP_LABELS"),
    dxfPair(62, 2),
    dxfPair(100, "AcDbText"),
    dxfPair(10, "2.2"),
    dxfPair(20, "0.8"),
    dxfPair(30, "0.0"),
    dxfPair(40, "1.5"),
    dxfPair(1, "NAP-01"),
    dxfPair(7, "SIMPLEX"),
    dxfPair(100, "AcDbAttributeDefinition"),
    dxfPair(3, "NAP IDENTIFIER"),
    dxfPair(2, "NAP_ID"),
    dxfPair(70, 0),
    // ATTDEF SPLITTER
    dxfPair(0, "ATTDEF"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "NAP_LABELS"),
    dxfPair(62, 2),
    dxfPair(100, "AcDbText"),
    dxfPair(10, "2.2"),
    dxfPair(20, "-0.7"),
    dxfPair(30, "0.0"),
    dxfPair(40, "1.2"),
    dxfPair(1, "1:8"),
    dxfPair(7, "SIMPLEX"),
    dxfPair(100, "AcDbAttributeDefinition"),
    dxfPair(3, "SPLITTER RATIO"),
    dxfPair(2, "SPLITTER"),
    dxfPair(70, 0),
    // ATTDEF POLE_TAG
    dxfPair(0, "ATTDEF"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "NAP_LABELS"),
    dxfPair(62, 7),
    dxfPair(100, "AcDbText"),
    dxfPair(10, "2.2"),
    dxfPair(20, "-2.0"),
    dxfPair(30, "0.0"),
    dxfPair(40, "1.0"),
    dxfPair(1, "PT-01"),
    dxfPair(7, "SIMPLEX"),
    dxfPair(100, "AcDbAttributeDefinition"),
    dxfPair(3, "POLE REFERENCE"),
    dxfPair(2, "POLE_TAG"),
    dxfPair(70, 0),
    // ATTDEF COORDINATES
    dxfPair(0, "ATTDEF"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "NAP_LABELS"),
    dxfPair(62, 8),
    dxfPair(100, "AcDbText"),
    dxfPair(10, "2.2"),
    dxfPair(20, "-3.1"),
    dxfPair(30, "0.0"),
    dxfPair(40, "0.85"),
    dxfPair(1, "0.000000, 0.000000"),
    dxfPair(7, "SIMPLEX"),
    dxfPair(100, "AcDbAttributeDefinition"),
    dxfPair(3, "COORDINATES"),
    dxfPair(2, "COORDINATES"),
    dxfPair(70, 0),
    // ENDBLK
    dxfPair(0, "ENDBLK"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "0"),
    dxfPair(100, "AcDbBlockEnd"),
  ].join("\n");
}

function napHex16pBlockDefinition() {
  return [
    dxfPair(0, "BLOCK"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "0"),
    dxfPair(100, "AcDbBlockBegin"),
    dxfPair(2, "NAP_16PORT"),
    dxfPair(70, 2),
    dxfPair(10, 0),
    dxfPair(20, 0),
    dxfPair(30, 0),
    dxfPair(3, "NAP_16PORT"),
    dxfPair(1, ""),
    // 16-Port Hex / Enclosure
    dxfPair(0, "LWPOLYLINE"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "NAP_STENCIL"),
    dxfPair(62, 5),
    dxfPair(100, "AcDbPolyline"),
    dxfPair(90, 6),
    dxfPair(70, 1),
    dxfPair(10, "-2.0"),
    dxfPair(20, "-1.2"),
    dxfPair(10, "2.0"),
    dxfPair(20, "-1.2"),
    dxfPair(10, "2.4"),
    dxfPair(20, "0.0"),
    dxfPair(10, "2.0"),
    dxfPair(20, "1.2"),
    dxfPair(10, "-2.0"),
    dxfPair(20, "1.2"),
    dxfPair(10, "-2.4"),
    dxfPair(20, "0.0"),
    // Center label "16P"
    dxfPair(0, "TEXT"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "NAP_STENCIL"),
    dxfPair(62, 5),
    dxfPair(100, "AcDbText"),
    dxfPair(10, "0.0"),
    dxfPair(20, "0.0"),
    dxfPair(30, "0.0"),
    dxfPair(40, "0.8"),
    dxfPair(1, "16P"),
    dxfPair(7, "SIMPLEX"),
    dxfPair(72, 4),
    dxfPair(11, "0.0"),
    dxfPair(21, "0.0"),
    dxfPair(31, "0.0"),
    dxfPair(100, "AcDbText"),
    // ATTDEF NAP_ID
    dxfPair(0, "ATTDEF"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "NAP_LABELS"),
    dxfPair(62, 2),
    dxfPair(100, "AcDbText"),
    dxfPair(10, "2.8"),
    dxfPair(20, "0.8"),
    dxfPair(30, "0.0"),
    dxfPair(40, "1.5"),
    dxfPair(1, "NAP-01"),
    dxfPair(7, "SIMPLEX"),
    dxfPair(100, "AcDbAttributeDefinition"),
    dxfPair(3, "NAP IDENTIFIER"),
    dxfPair(2, "NAP_ID"),
    dxfPair(70, 0),
    // ATTDEF SPLITTER
    dxfPair(0, "ATTDEF"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "NAP_LABELS"),
    dxfPair(62, 2),
    dxfPair(100, "AcDbText"),
    dxfPair(10, "2.8"),
    dxfPair(20, "-0.7"),
    dxfPair(30, "0.0"),
    dxfPair(40, "1.2"),
    dxfPair(1, "1:16"),
    dxfPair(7, "SIMPLEX"),
    dxfPair(100, "AcDbAttributeDefinition"),
    dxfPair(3, "SPLITTER RATIO"),
    dxfPair(2, "SPLITTER"),
    dxfPair(70, 0),
    // ATTDEF POLE_TAG
    dxfPair(0, "ATTDEF"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "NAP_LABELS"),
    dxfPair(62, 7),
    dxfPair(100, "AcDbText"),
    dxfPair(10, "2.8"),
    dxfPair(20, "-2.0"),
    dxfPair(30, "0.0"),
    dxfPair(40, "1.0"),
    dxfPair(1, "PT-01"),
    dxfPair(7, "SIMPLEX"),
    dxfPair(100, "AcDbAttributeDefinition"),
    dxfPair(3, "POLE REFERENCE"),
    dxfPair(2, "POLE_TAG"),
    dxfPair(70, 0),
    // ATTDEF COORDINATES
    dxfPair(0, "ATTDEF"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "NAP_LABELS"),
    dxfPair(62, 8),
    dxfPair(100, "AcDbText"),
    dxfPair(10, "2.8"),
    dxfPair(20, "-3.1"),
    dxfPair(30, "0.0"),
    dxfPair(40, "0.85"),
    dxfPair(1, "0.000000, 0.000000"),
    dxfPair(7, "SIMPLEX"),
    dxfPair(100, "AcDbAttributeDefinition"),
    dxfPair(3, "COORDINATES"),
    dxfPair(2, "COORDINATES"),
    dxfPair(70, 0),
    // ENDBLK
    dxfPair(0, "ENDBLK"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "0"),
    dxfPair(100, "AcDbBlockEnd"),
  ].join("\n");
}

function napSplitterBlockDefinition() {
  return [
    dxfPair(0, "BLOCK"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "0"),
    dxfPair(100, "AcDbBlockBegin"),
    dxfPair(2, "NAP_SPLITTER"),
    dxfPair(70, 2),
    dxfPair(10, 0),
    dxfPair(20, 0),
    dxfPair(30, 0),
    dxfPair(3, "NAP_SPLITTER"),
    dxfPair(1, ""),
    // Inverted Splitter Triangle
    dxfPair(0, "LWPOLYLINE"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "NAP_STENCIL"),
    dxfPair(62, 6),
    dxfPair(100, "AcDbPolyline"),
    dxfPair(90, 3),
    dxfPair(70, 1),
    dxfPair(10, "-1.5"),
    dxfPair(20, "1.2"),
    dxfPair(10, "1.5"),
    dxfPair(20, "1.2"),
    dxfPair(10, "0.0"),
    dxfPair(20, "-1.2"),
    // ATTDEF NAP_ID
    dxfPair(0, "ATTDEF"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "NAP_LABELS"),
    dxfPair(62, 2),
    dxfPair(100, "AcDbText"),
    dxfPair(10, "2.2"),
    dxfPair(20, "0.8"),
    dxfPair(30, "0.0"),
    dxfPair(40, "1.5"),
    dxfPair(1, "NAP-01"),
    dxfPair(7, "SIMPLEX"),
    dxfPair(100, "AcDbAttributeDefinition"),
    dxfPair(3, "NAP IDENTIFIER"),
    dxfPair(2, "NAP_ID"),
    dxfPair(70, 0),
    // ATTDEF SPLITTER
    dxfPair(0, "ATTDEF"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "NAP_LABELS"),
    dxfPair(62, 2),
    dxfPair(100, "AcDbText"),
    dxfPair(10, "2.2"),
    dxfPair(20, "-0.7"),
    dxfPair(30, "0.0"),
    dxfPair(40, "1.2"),
    dxfPair(1, "1:8"),
    dxfPair(7, "SIMPLEX"),
    dxfPair(100, "AcDbAttributeDefinition"),
    dxfPair(3, "SPLITTER RATIO"),
    dxfPair(2, "SPLITTER"),
    dxfPair(70, 0),
    // ATTDEF POLE_TAG
    dxfPair(0, "ATTDEF"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "NAP_LABELS"),
    dxfPair(62, 7),
    dxfPair(100, "AcDbText"),
    dxfPair(10, "2.2"),
    dxfPair(20, "-2.0"),
    dxfPair(30, "0.0"),
    dxfPair(40, "1.0"),
    dxfPair(1, "PT-01"),
    dxfPair(7, "SIMPLEX"),
    dxfPair(100, "AcDbAttributeDefinition"),
    dxfPair(3, "POLE REFERENCE"),
    dxfPair(2, "POLE_TAG"),
    dxfPair(70, 0),
    // ENDBLK
    dxfPair(0, "ENDBLK"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, "0"),
    dxfPair(100, "AcDbBlockEnd"),
  ].join("\n");
}

function parsePldtPoleComponents(placemark: Placemark) {
  const rawText = (placemark.name || "").trim();
  const rawDesc = (placemark.description || "").trim();
  const allLines = `${rawText}\n${rawDesc}`.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);
  const firstLine = allLines[0] || "";
  const landmark = allLines.slice(1).join(" ");

  // Clean leading prefix like PLDT-, SMART-, PT-, GT-, EP-
  const clean = firstLine.replace(/^(?:PLDT|SMART|PT|GT|EP)\s*[-_:]\s*/i, "").trim();

  let poleTag = "";
  let poleType = "CC";
  let clamp = "";

  // 1. Specialized regex matching e.g. "0037825cc7-9", "00426xxcc5-7", "xxxxx75cc 7-9", "nptcc5-7", "cotelcocc7-9"
  const specMatch = clean.match(/^(.*?)(cc|wp|wo|st|gi|sc)\s*([0-9]+[\.\/\-][0-9]+|[0-9]+(?:\.[0-9]+)?m?)$/i);
  if (specMatch) {
    poleTag = specMatch[1].trim();
    poleType = specMatch[2].toUpperCase();
    clamp = specMatch[3].replace(/[/_]/g, "-").trim();
  } else {
    // 2. Check clamp without type: e.g. "npt5-7", "0037825-7-9"
    const clampMatch = clean.match(/^(.*?)\s*([0-9]+[\.\/\-][0-9]+|[0-9]+(?:\.[0-9]+)?m?)$/i);
    const typeMatch = clean.match(/^(.*?)(cc|wp|wo|st|gi|sc)$/i);
    if (clampMatch) {
      poleTag = clampMatch[1].trim();
      clamp = clampMatch[2].replace(/[/_]/g, "-").trim();
    } else if (typeMatch) {
      poleTag = typeMatch[1].trim();
      poleType = typeMatch[2].toUpperCase();
    } else {
      poleTag = clean;
    }
  }

  // Override pole type from properties if explicit
  const propType = formatRawPoleType(placemark.properties);
  if (propType && propType !== "CC") {
    poleType = propType;
  }

  // Clean pole tag
  if (!poleTag || /^(?:npt|ptnpt|no\s*tag|notag)$/i.test(poleTag)) {
    poleTag = "PLDT-NPT";
  } else {
    poleTag = poleTag.replace(/[\s\-_:]+$/, "").trim();
  }

  // Format CC value: e.g. CC(7-9), CC(5-7), CC, WP, ST
  let ccVal = poleType;
  if (clamp) {
    ccVal = `${poleType}(${clamp})`;
  }

  return {
    poleTag,
    poleType,
    clamp,
    ccVal,
    landmark,
  };
}

export function parsePldtStructuredPoleComponents(placemark: Placemark) {
  const rawName = (placemark.name || "").trim();
  const bulletParts = /[•·]/.test(rawName) ? rawName.split(/\s*[•·]\s*/).map((p) => p.trim()) : [];
  const nameTag = bulletParts.length >= 2 ? bulletParts[1] : "";
  const nameMat = bulletParts.length >= 3 ? bulletParts[2] : "";
  const nameSize = bulletParts.length >= 4 ? bulletParts[3] : "";

  const propTag = cleanFieldValue(
    findProperty(placemark.properties, [
      "pole tag #",
      "pole tag",
      "pole_tag",
      "poletag",
      "pole no",
      "pole_no",
      "pole number",
      "pole_number",
      "tag",
    ]),
  );
  const propMatSize = cleanFieldValue(
    findProperty(placemark.properties, [
      "material / size",
      "material/size",
      "materialsize",
      "material",
      "pole material",
      "pole_material",
    ]),
  );
  const propProposed = cleanFieldValue(
    findProperty(placemark.properties, ["proposed pole", "proposed_pole", "proposedpole"]),
  );
  const propRemarks = cleanFieldValue(findProperty(placemark.properties, ["remarks", "remark"]));

  let candidateTag = propTag || nameTag;
  if (!candidateTag && bulletParts.length === 0) {
    const legacy = parsePldtPoleComponents(placemark);
    candidateTag = legacy.poleTag === "PLDT-NPT" ? "NPT" : legacy.poleTag;
  }

  const pureTag = candidateTag.replace(/^(?:PLDT|SMART|PT|ELEC|ELECTRIC|EP)\s*[-_:]\s*/i, "").trim();
  const isNpt = !pureTag || /^(?:npt|ptnpt|pldtnpt|epnpt|no\s*tag|notag|none|-)$/i.test(pureTag);

  const pldtLine1 = isNpt ? "PLDT-NPT" : `PLDT-${pureTag}`;
  const elecLine1 = isNpt ? "NPT" : pureTag;

  let matCode = "";
  let sizeCode = "";
  if (propMatSize) {
    const mMat = propMatSize.match(/^([A-Za-z0-9]+)\s*(?:\(|•|·|-|$)/);
    if (mMat) matCode = mMat[1].toUpperCase();
    const mSize = propMatSize.match(/size\s*[:\-]?\s*([0-9]+(?:[\.\/\-][0-9]+)?m?)/i);
    if (mSize) sizeCode = mSize[1].replace(/[/_]/g, "-").trim();
  }
  if (!matCode && nameMat) matCode = nameMat.toUpperCase();
  if (!sizeCode && nameSize) sizeCode = nameSize.replace(/[/_]/g, "-").trim();

  if (!matCode && !sizeCode && bulletParts.length === 0) {
    const legacy = parsePldtPoleComponents(placemark);
    matCode = legacy.poleType;
    sizeCode = legacy.clamp;
  }

  matCode = matCode || "CC";
  const ccVal = sizeCode ? `${matCode}(${sizeCode})` : matCode;

  const propToken = [propProposed, rawName, propRemarks].join(" ");
  const proposedHeight = /\b(?:p[-_\s]*7|7\.5m?|7\.62m?|5-7)\b/i.test(propToken)
    ? "7.5m"
    : /\b(?:p[-_\s]*9|9\.14m?|9\.0m?|9m|7-9|8-10)\b/i.test(propToken)
      ? "9.14m"
      : sizeCode.includes("7-9") || sizeCode.includes("8-10") || sizeCode.includes("9")
        ? "9.14m"
        : sizeCode.includes("5-7") || sizeCode.includes("7")
          ? "7.5m"
          : cleanFieldValue(findProperty(placemark.properties, ["height", "pole height", "pole_height"])) || "7.5m";

  return {
    pureTag,
    pldtLine1,
    elecLine1,
    matCode,
    sizeCode,
    ccVal,
    proposedLine1: "Proposed Pole",
    proposedHeight,
  };
}

export type PldtClampSize = "5-7" | "7-9" | "8-10" | "12-14";

export type PldtPoleClampCode = "VS2" | "S2" | "B2" | "VB2" | "VS3" | "S3" | "B3" | "VB3";

export type PldtPoleClampInfo = {
  size: PldtClampSize;
  isCorner: boolean;
  deflectionDeg: number;
  code: PldtPoleClampCode;
  layer: LayerName;
  color: number;
  trueColor: number;
};

export function resolvePldtPoleClampSize(placemark: Placemark, provider: TelcoProvider = "pldt"): PldtClampSize {
  const isStructured = provider === "pldt";
  const s = isStructured ? parsePldtStructuredPoleComponents(placemark) : null;
  const leg = parsePldtPoleComponents(placemark);

  const rawMatSize = cleanFieldValue(
    findProperty(placemark.properties, [
      "material / size",
      "material/size",
      "materialsize",
      "size",
      "clamp",
      "pole size",
      "pole_size",
    ]),
  );
  const rawProp = cleanFieldValue(
    findProperty(placemark.properties, ["proposed pole", "proposed_pole", "proposedpole"]),
  );
  const combined = [
    s?.sizeCode || "",
    leg.clamp || "",
    rawMatSize,
    rawProp,
    placemark.name || "",
  ].join(" ");

  if (/\b(?:12[-/_]14|11[-/_]13)\b/i.test(combined)) return "12-14";
  if (/\b(?:8[-/_]10|9[-/_]11|10[-/_]12)\b/i.test(combined)) return "8-10";
  if (/\b(?:p[-_\s]*7|p[-_\s]*9)\b/i.test(combined)) return "7-9";
  if (/\b(?:5[-/_]7)\b/i.test(combined)) return "5-7";
  if (/\b(?:7[-/_]9)\b/i.test(combined)) return "7-9";

  if (isProposedPole(placemark)) {
    return "7-9";
  }

  return "7-9";
}

export function computePoleDeflectionMap(placemarks: ClassifiedPlacemark[]): Map<string, number> {
  const map = new Map<string, number>();
  const polePlacemarks = placemarks.filter(
    (p): p is ClassifiedPlacemark & { geometry: Extract<Geometry, { type: "Point" }> } => p.geometry.type === "Point",
  );
  if (!polePlacemarks.length) return map;

  const refLatRad = (polePlacemarks[0].geometry.coordinates.lat * Math.PI) / 180;
  const cosLat = Math.max(Math.cos(refLatRad), 0.15);
  const toLocalMeters = (pt: LonLat) => ({
    x: (pt.lon - polePlacemarks[0].geometry.coordinates.lon) * 111320 * cosLat,
    y: (pt.lat - polePlacemarks[0].geometry.coordinates.lat) * 111320,
  });

  const poleMeters = polePlacemarks.map((p) => ({
    id: p.id,
    pt: toLocalMeters(p.geometry.coordinates),
  }));

  const routeSegments: Array<{ a: { x: number; y: number }; b: { x: number; y: number } }> = [];
  for (const pm of placemarks) {
    if (
      pm.geometry.type === "LineString" &&
      (pm.layer === "CABLE_ROUTES" || pm.layer === "SPAN" || pm.layer === "SOURCE_LINES" || pm.layer === "FEEDER_CABLES")
    ) {
      const coords = pm.geometry.coordinates;
      for (let i = 0; i < coords.length - 1; i++) {
        const a = toLocalMeters(coords[i]);
        const b = toLocalMeters(coords[i + 1]);
        if (Math.hypot(b.x - a.x, b.y - a.y) >= 0.5) {
          routeSegments.push({ a, b });
        }
      }
    }
  }

  for (let i = 0; i < poleMeters.length; i++) {
    const cur = poleMeters[i];
    const outgoingDirs: Array<{ x: number; y: number }> = [];

    for (const seg of routeSegments) {
      const dA = Math.hypot(seg.a.x - cur.pt.x, seg.a.y - cur.pt.y);
      const dB = Math.hypot(seg.b.x - cur.pt.x, seg.b.y - cur.pt.y);
      if (dA <= 6.0 && dB > dA) {
        const len = Math.hypot(seg.b.x - cur.pt.x, seg.b.y - cur.pt.y);
        if (len > 0.5) {
          const ux = (seg.b.x - cur.pt.x) / len;
          const uy = (seg.b.y - cur.pt.y) / len;
          if (!outgoingDirs.some((v) => v.x * ux + v.y * uy > 0.994)) {
            outgoingDirs.push({ x: ux, y: uy });
          }
        }
      } else if (dB <= 6.0 && dA > dB) {
        const len = Math.hypot(seg.a.x - cur.pt.x, seg.a.y - cur.pt.y);
        if (len > 0.5) {
          const ux = (seg.a.x - cur.pt.x) / len;
          const uy = (seg.a.y - cur.pt.y) / len;
          if (!outgoingDirs.some((v) => v.x * ux + v.y * uy > 0.994)) {
            outgoingDirs.push({ x: ux, y: uy });
          }
        }
      }
    }

    let deflectionDeg = 0;
    if (outgoingDirs.length === 2) {
      const dot = Math.max(-1, Math.min(1, outgoingDirs[0].x * outgoingDirs[1].x + outgoingDirs[0].y * outgoingDirs[1].y));
      const angleBetweenDeg = (Math.acos(dot) * 180) / Math.PI;
      deflectionDeg = Math.abs(180 - angleBetweenDeg);
    } else if (outgoingDirs.length >= 3) {
      deflectionDeg = 90;
    } else if (i > 0 && i < poleMeters.length - 1) {
      const prev = poleMeters[i - 1].pt;
      const next = poleMeters[i + 1].pt;
      const len1 = Math.hypot(cur.pt.x - prev.x, cur.pt.y - prev.y);
      const len2 = Math.hypot(next.x - cur.pt.x, next.y - cur.pt.y);
      if (len1 >= 1.0 && len1 <= 250.0 && len2 >= 1.0 && len2 <= 250.0) {
        const v1x = (cur.pt.x - prev.x) / len1;
        const v1y = (cur.pt.y - prev.y) / len1;
        const v2x = (next.x - cur.pt.x) / len2;
        const v2y = (next.y - cur.pt.y) / len2;
        const dot = Math.max(-1, Math.min(1, v1x * v2x + v1y * v2y));
        deflectionDeg = (Math.acos(dot) * 180) / Math.PI;
      }
    }

    map.set(cur.id, deflectionDeg);
  }

  return map;
}

export function resolvePldtPoleClampInfo(
  placemark: Placemark,
  deflectionDeg = 0,
  provider: TelcoProvider = "pldt",
  cornerThresholdDeg = 15.0,
): PldtPoleClampInfo {
  const size = resolvePldtPoleClampSize(placemark, provider);
  const isCorner = deflectionDeg >= cornerThresholdDeg;

  const table: Record<
    PldtClampSize,
    { caCode: PldtPoleClampCode; caLayer: LayerName; gcaCode: PldtPoleClampCode; gcaLayer: LayerName }
  > = {
    "5-7": {
      caCode: "VS2",
      caLayer: "CA pole clamp 5-7",
      gcaCode: "VS3",
      gcaLayer: "GCA pole clamp 5-7",
    },
    "7-9": {
      caCode: "S2",
      caLayer: "CA pole clamp 7-9",
      gcaCode: "S3",
      gcaLayer: "GCA pole clamp 7-9",
    },
    "8-10": {
      caCode: "B2",
      caLayer: "CA pole clamp 8-10",
      gcaCode: "B3",
      gcaLayer: "GCA pole clamp 8-10",
    },
    "12-14": {
      caCode: "VB2",
      caLayer: "CA pole clamp 12-14",
      gcaCode: "VB3",
      gcaLayer: "GCA pole clamp 12-14",
    },
  };

  const entry = table[size];
  return {
    size,
    isCorner,
    deflectionDeg,
    code: isCorner ? entry.gcaCode : entry.caCode,
    layer: isCorner ? entry.gcaLayer : entry.caLayer,
    color: isCorner ? 217 : 85,
    trueColor: isCorner ? 9643919 : 5814856,
  };
}

function entityPoleClampMText(
  layer: LayerName,
  rawText: string,
  point: CadPoint,
  height: number,
  width: number,
  color: number,
  trueColor?: number,
  attachment = 1,
  textStyle = "STANDARD",
  rotDeg = 0,
) {
  const rad = (rotDeg * Math.PI) / 180;
  const dirX = rotDeg === 0 ? "0.9999904626576194" : Math.cos(rad).toFixed(16);
  const dirY = rotDeg === 0 ? "-0.0043674470575357" : Math.sin(rad).toFixed(16);
  return [
    dxfPair(0, "MTEXT"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, layer),
    dxfPair(62, color),
    ...(trueColor !== undefined ? [dxfPair(420, trueColor)] : []),
    dxfPair(100, "AcDbMText"),
    dxfPair(10, cadCoord(point.x)),
    dxfPair(20, cadCoord(point.y)),
    dxfPair(30, cadCoord(point.z)),
    dxfPair(40, cadSize(height)),
    dxfPair(41, cadSize(width)),
    dxfPair(46, "0.0"),
    dxfPair(71, attachment),
    dxfPair(72, 5),
    dxfPair(1, rawText),
    dxfPair(7, textStyle),
    dxfPair(11, dirX),
    dxfPair(21, dirY),
    dxfPair(31, "0.0"),
    dxfPair(73, 1),
    dxfPair(44, "1.0"),
  ].join("\n");
}

function entityLwPolylineRect(
  layer: LayerName,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color?: number,
) {
  return [
    dxfPair(0, "LWPOLYLINE"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbEntity"),
    dxfPair(8, layer),
    ...(color !== undefined ? [dxfPair(62, color)] : []),
    dxfPair(100, "AcDbPolyline"),
    dxfPair(90, 4),
    dxfPair(70, 1),
    dxfPair(43, "0.0"),
    dxfPair(10, cadCoord(x1)),
    dxfPair(20, cadCoord(y0)),
    dxfPair(10, cadCoord(x0)),
    dxfPair(20, cadCoord(y0)),
    dxfPair(10, cadCoord(x0)),
    dxfPair(20, cadCoord(y1)),
    dxfPair(10, cadCoord(x1)),
    dxfPair(20, cadCoord(y1)),
  ].join("\n");
}

function buildPldtPoleClampStencilBoxEntities(origin: CadPoint, scale = 1.0): string[] {
  const ox = origin.x;
  const oy = origin.y;
  const oz = origin.z;
  const pt = (dx: number, dy: number): CadPoint => ({ x: ox + dx * scale, y: oy + dy * scale, z: oz });
  const h2 = 2.0 * scale;
  const w16 = 16.71311651 * scale;

  return [
    // Outer LOT BOUNDARY rectangle
    entityLwPolylineRect("LOT BOUNDARY", ox, oy, ox + 119.32557304 * scale, oy + 74.30614852 * scale),
    // Inner NAP BOUNDREY red rectangle
    entityLwPolylineRect("NAP BOUNDREY", ox + 13.68175232 * scale, oy + 3.6389945 * scale, ox + 82.47756198 * scale, oy + 41.33345233 * scale, 1),
    // Header "POLE CLAMP" on SAG
    entityPoleClampMText("SAG", "\\pxsm0.9,qc;{\\W0.95;POLE CLAMP}", pt(59.62905932, 66.23324232), 15.54568392 * scale, 106.93838237 * scale, 3, undefined, 2, "样式 1"),
    // Column Headers
    entityPoleClampMText("CA pole clamp 5-7", "CA CLAMP - STRAIGHT (WITH COMP)", pt(17.74362601, 39.09824714), h2, 19.9939037 * scale, 85, 5814856, 1, "STANDARD"),
    entityPoleClampMText("GCA pole clamp 5-7", "GCA CLAMP CURVE CORNER", pt(41.01542255, 38.92372057), h2, w16, 217, 9643919, 1, "STANDARD"),
    // Size labels (Yellow 2)
    entityPoleClampMText("CA pole clamp 5-7", "5-7", pt(14.52739956, 24.28065376), h2, w16, 2, undefined, 1, "STANDARD"),
    entityPoleClampMText("CA pole clamp 5-7", "7-9", pt(14.52739956, 21.0231123), h2, w16, 2, undefined, 1, "STANDARD"),
    entityPoleClampMText("CA pole clamp 5-7", "8-10", pt(14.52739956, 17.63898244), h2, w16, 2, undefined, 1, "STANDARD"),
    entityPoleClampMText("CA pole clamp 5-7", "12-14", pt(14.52739956, 14.50634153), h2, w16, 2, undefined, 1, "STANDARD"),
    // CA Clamp Straight codes (Green 85 / 5814856)
    entityPoleClampMText("CA pole clamp 5-7", "VS2", pt(24.24052597, 24.14544304), h2, w16, 85, 5814856, 1, "STANDARD"),
    entityPoleClampMText("CA pole clamp 7-9", "S2", pt(26.13003173, 20.95029168), h2, w16, 85, 5814856, 1, "STANDARD"),
    entityPoleClampMText("CA pole clamp 8-10", "B2", pt(26.38640055, 17.84427724), h2, w16, 85, 5814856, 1, "STANDARD"),
    entityPoleClampMText("CA pole clamp 12-14", "VB2", pt(24.46257854, 14.51412632), h2, w16, 85, 5814856, 1, "STANDARD"),
    // GCA Clamp Curve/Corner codes (Purple 217 / 9643919)
    entityPoleClampMText("GCA pole clamp 5-7", "VS3", pt(41.81311344, 23.83302658), h2, w16, 217, 9643919, 1, "STANDARD"),
    entityPoleClampMText("GCA pole clamp 7-9", "S3", pt(43.7026192, 20.63787522), h2, w16, 217, 9643919, 1, "STANDARD"),
    entityPoleClampMText("GCA pole clamp 8-10", "B3", pt(43.95898802, 17.53186078), h2, w16, 217, 9643919, 1, "STANDARD"),
    entityPoleClampMText("GCA pole clamp 12-14", "VB3", pt(42.03516601, 14.20170986), h2, w16, 217, 9643919, 1, "STANDARD"),
  ];
}

export function previewPoleStencilAttributes(
  placemark: ClassifiedPlacemark,
  provider: TelcoProvider = "globe",
  deflectionDeg = 0,
): { blockName: string; line1: string; line2: string; clamp?: PldtPoleClampInfo } {
  const isProposed = isProposedPole(placemark);
  if (isPldtProvider(provider)) {
    const clamp = resolvePldtPoleClampInfo(placemark, deflectionDeg, provider);
    const isPldt = !isProposed && (detectPoleOwner(placemark) === "PLDT" || hasPtIdentification(placemark));
    if (provider === "pldt") {
      const s = parsePldtStructuredPoleComponents(placemark);
      if (isProposed) return { blockName: "NEW_PROPOSE POLE_SYSMBOL", line1: s.proposedLine1, line2: s.proposedHeight, clamp };
      if (isPldt) return { blockName: "NEW_PLDT_SYSMBOL", line1: s.pldtLine1, line2: s.ccVal, clamp };
      return { blockName: "NEW_ELECTRIC_SYSMBOL", line1: s.elecLine1, line2: s.ccVal, clamp };
    }
    const leg = parsePldtPoleComponents(placemark);
    if (isProposed) {
      const h =
        leg.clamp.includes("7-9") || leg.clamp.includes("9")
          ? "9.14m"
          : leg.clamp.includes("5-7") || leg.clamp.includes("7.5")
            ? "7.5m"
            : cleanFieldValue(findProperty(placemark.properties, ["height", "pole height", "pole_height"])) || "7.5m";
      return { blockName: "NEW_PROPOSE POLE_SYSMBOL", line1: "Proposed Pole", line2: h, clamp };
    }
    if (isPldt) return { blockName: "NEW_PLDT_SYSMBOL", line1: leg.poleTag, line2: leg.ccVal, clamp };
    const owner = detectPoleOwner(placemark);
    const layer = placemark.layer;
    let epValue = owner && owner !== "OTHER" && owner !== "ELECTRIC" ? owner : leg.poleTag;
    if (layer && layer !== "ELECTRIC POLE" && layer !== "P-POLE" && layer !== "POLE PLDT-SMART" && layer !== "PLDT") {
      epValue = layer;
    }
    if (epValue === "PLDT-NPT" || !epValue) epValue = "NPT";
    return { blockName: "NEW_ELECTRIC_SYSMBOL", line1: epValue, line2: leg.ccVal, clamp };
  }
  const isElectric = !isProposed && isElectricPole(placemark);
  if (isProposed) return { blockName: "P-POLE", line1: "PROPOSED POLE", line2: `${formatRawPoleType(placemark.properties)} • ${resolveGlobeProposedPoleHeight(placemark)}` };
  if (isElectric) return { blockName: "EPOLE", line1: rawPoleTag(placemark), line2: formatRawPoleType(placemark.properties) };
  return { blockName: "PTPOLE", line1: rawPoleTag(placemark), line2: formatRawPoleType(placemark.properties) };
}

function estimateUnscaledDxfTextWidth(text: string, heightUnscaled: number, widthFactor = 1.0): number {
  let units = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "." || ch === "," || ch === ":" || ch === ";" || ch === "'" || ch === "|") {
      units += 0.40;
    } else if (ch === "1" || ch === "I" || ch === "i" || ch === "l" || ch === "-" || ch === " ") {
      units += 0.65;
    } else if (ch >= "A" && ch <= "Z") {
      units += 0.96;
    } else {
      units += 0.85;
    }
  }
  return units * heightUnscaled * widthFactor;
}

function entityBlockInsertWithAttributes(
  placemark: ClassifiedPlacemark,
  cadPoint: CadPoint,
  scale: number,
  provider: TelcoProvider = "globe",
  deflectionDeg = 0,
  poleLayout?: Pick<PoleLayoutResult, "rotDeg" | "sideX" | "slotY">,
) {
  const fields = poleTemplateFields(placemark);
  const isProposed = isProposedPole(placemark);
  const isElectric = !isProposed && isElectricPole(placemark);
  const rotDeg = poleLayout?.rotDeg ?? 0;
  const sideX = poleLayout?.sideX ?? 1;
  const slotY = poleLayout?.slotY ?? "default";
  const rotRad = (rotDeg * Math.PI) / 180;
  const cosR = Math.cos(rotRad);
  const sinR = Math.sin(rotRad);
  const rotStr = rotDeg.toFixed(4);

  if (isPldtProvider(provider)) {
    const isStructuredPldt = provider === "pldt";
    const isPldt = !isProposed && (detectPoleOwner(placemark) === "PLDT" || hasPtIdentification(placemark));
    const blockName = isProposed
      ? "NEW_PROPOSE POLE_SYSMBOL"
      : isPldt
        ? "NEW_PLDT_SYSMBOL"
        : "NEW_ELECTRIC_SYSMBOL";

    const layer: LayerName = placemark.layer || (isProposed
      ? "P-POLE"
      : isPldt
        ? "PLDT"
        : "ELECTRIC POLE");

    const pldtAttrPlacement = (ux: number, uy: number, text: string, hUnscaled: number, wf = 0.7) => {
      const wUnscaled = estimateUnscaledDxfTextWidth(text, hUnscaled, wf);
      const lxStart = (sideX < 0 ? -ux - wUnscaled : ux) * scale;
      const lxAnchor = (sideX < 0 ? -ux : ux) * scale;
      const ly = uy * scale;
      const startPt: CadPoint = {
        x: cadPoint.x + lxStart * cosR - ly * sinR,
        y: cadPoint.y + lxStart * sinR + ly * cosR,
        z: cadPoint.z,
      };
      const anchorPt: CadPoint = {
        x: cadPoint.x + lxAnchor * cosR - ly * sinR,
        y: cadPoint.y + lxAnchor * sinR + ly * cosR,
        z: cadPoint.z,
      };
      return { startPt, anchorPt };
    };

    const entities: string[] = [];

    // INSERT entity (mirrored via X scale when sideX < 0)
    entities.push(
      [
        dxfPair(0, "INSERT"),
        dxfPair(5, dxfHandle()),
        dxfPair(100, "AcDbEntity"),
        dxfPair(8, layer),
        dxfPair(62, 6),
        dxfPair(100, "AcDbBlockReference"),
        dxfPair(66, 1),
        dxfPair(2, blockName),
        dxfPair(10, cadCoord(cadPoint.x)),
        dxfPair(20, cadCoord(cadPoint.y)),
        dxfPair(30, cadCoord(cadPoint.z)),
        dxfPair(41, cadSize(sideX * scale)),
        dxfPair(42, cadSize(scale)),
        dxfPair(43, cadSize(scale)),
        dxfPair(50, rotStr),
      ].join("\n"),
    );

    const latLonStr = `${fields.lat}, ${fields.lon}`;

    if (blockName === "NEW_PLDT_SYSMBOL") {
      const structuredInfo = isStructuredPldt ? parsePldtStructuredPoleComponents(placemark) : null;
      const pldtInfo = !isStructuredPldt ? parsePldtPoleComponents(placemark) : null;
      const pldtValue = structuredInfo ? structuredInfo.pldtLine1 : pldtInfo!.poleTag;
      const ccValue = structuredInfo ? structuredInfo.ccVal : pldtInfo!.ccVal;
      const uy1 = slotY === "above" ? 2.4000 : 0.8000;
      const uy2 = slotY === "above" ? 0.4000 : -1.2000;
      const uy3 = slotY === "above" ? -0.8000 : -2.4000;
      const p1 = pldtAttrPlacement(1.9500, uy1, pldtValue, 2.8469, 0.7);
      const p2 = pldtAttrPlacement(1.9500, uy2, ccValue, 1.6181, 0.6);
      const p3 = pldtAttrPlacement(1.9500, uy3, latLonStr, 0.9708, 0.6);

      // ATTRIB PLDT
      entities.push(
        [
          dxfPair(0, "ATTRIB"),
          dxfPair(5, dxfHandle()),
          dxfPair(100, "AcDbEntity"),
          dxfPair(8, layer),
          dxfPair(100, "AcDbText"),
          dxfPair(10, cadCoord(p1.startPt.x)),
          dxfPair(20, cadCoord(p1.startPt.y)),
          dxfPair(30, cadCoord(p1.startPt.z)),
          dxfPair(40, cadSize(2.8469 * scale)),
          dxfPair(1, sanitizeDxfText(pldtValue)),
          dxfPair(50, rotStr),
          dxfPair(41, "0.7"),
          dxfPair(7, "样式 1"),
          ...(sideX < 0
            ? [
                dxfPair(72, 2),
                dxfPair(11, cadCoord(p1.anchorPt.x)),
                dxfPair(21, cadCoord(p1.anchorPt.y)),
                dxfPair(31, cadCoord(p1.anchorPt.z)),
              ]
            : []),
          dxfPair(100, "AcDbAttribute"),
          dxfPair(280, 0),
          dxfPair(2, "PLDT"),
          dxfPair(70, 0),
          dxfPair(280, 0),
        ].join("\n"),
      );

      // ATTRIB CC
      entities.push(
        [
          dxfPair(0, "ATTRIB"),
          dxfPair(5, dxfHandle()),
          dxfPair(100, "AcDbEntity"),
          dxfPair(8, layer),
          dxfPair(100, "AcDbText"),
          dxfPair(10, cadCoord(p2.startPt.x)),
          dxfPair(20, cadCoord(p2.startPt.y)),
          dxfPair(30, cadCoord(p2.startPt.z)),
          dxfPair(40, cadSize(1.6181 * scale)),
          dxfPair(1, sanitizeDxfText(ccValue)),
          dxfPair(50, rotStr),
          dxfPair(41, "0.6"),
          dxfPair(7, "样式 1"),
          ...(sideX < 0
            ? [
                dxfPair(72, 2),
                dxfPair(11, cadCoord(p2.anchorPt.x)),
                dxfPair(21, cadCoord(p2.anchorPt.y)),
                dxfPair(31, cadCoord(p2.anchorPt.z)),
              ]
            : []),
          dxfPair(100, "AcDbAttribute"),
          dxfPair(280, 0),
          dxfPair(2, "CC"),
          dxfPair(70, 0),
          dxfPair(280, 0),
        ].join("\n"),
      );

      // ATTRIB COORDINATES
      entities.push(
        [
          dxfPair(0, "ATTRIB"),
          dxfPair(5, dxfHandle()),
          dxfPair(100, "AcDbEntity"),
          dxfPair(8, layer),
          dxfPair(100, "AcDbText"),
          dxfPair(10, cadCoord(p3.startPt.x)),
          dxfPair(20, cadCoord(p3.startPt.y)),
          dxfPair(30, cadCoord(p3.startPt.z)),
          dxfPair(40, cadSize(0.9708 * scale)),
          dxfPair(1, sanitizeDxfText(latLonStr)),
          dxfPair(50, rotStr),
          dxfPair(41, "0.6"),
          dxfPair(7, "样式 1"),
          ...(sideX < 0
            ? [
                dxfPair(72, 2),
                dxfPair(11, cadCoord(p3.anchorPt.x)),
                dxfPair(21, cadCoord(p3.anchorPt.y)),
                dxfPair(31, cadCoord(p3.anchorPt.z)),
              ]
            : []),
          dxfPair(100, "AcDbAttribute"),
          dxfPair(280, 0),
          dxfPair(2, "COORDINATES"),
          dxfPair(70, 0),
          dxfPair(280, 0),
        ].join("\n"),
      );
    } else if (blockName === "NEW_PROPOSE POLE_SYSMBOL") {
      let poleHeight = "7.5m";
      if (isStructuredPldt) {
        poleHeight = parsePldtStructuredPoleComponents(placemark).proposedHeight;
      } else {
        const pldtInfo = parsePldtPoleComponents(placemark);
        poleHeight =
          pldtInfo.clamp.includes("7-9") || pldtInfo.clamp.includes("9")
            ? "9.14m"
            : pldtInfo.clamp.includes("5-7") || pldtInfo.clamp.includes("7.5")
              ? "7.5m"
              : cleanFieldValue(findProperty(placemark.properties, ["height", "pole height", "pole_height"])) || "7.5m";
      }
      const uy1 = slotY === "above" ? 4.2000 : 1.2000;
      const uy2 = slotY === "above" ? 1.5000 : -1.5000;
      const uy3 = slotY === "above" ? -1.2000 : -4.2000;
      const p1 = pldtAttrPlacement(2.0000, uy1, "Proposed Pole", 1.9359, 0.8);
      const p2 = pldtAttrPlacement(2.0000, uy2, poleHeight, 1.9359, 0.8);
      const p3 = pldtAttrPlacement(2.0000, uy3, latLonStr, 1.9359, 0.8);

      // ATTRIB PROPOSED-POLE
      entities.push(
        [
          dxfPair(0, "ATTRIB"),
          dxfPair(5, dxfHandle()),
          dxfPair(100, "AcDbEntity"),
          dxfPair(8, "schematic co"),
          dxfPair(62, 1),
          dxfPair(100, "AcDbText"),
          dxfPair(10, cadCoord(p1.startPt.x)),
          dxfPair(20, cadCoord(p1.startPt.y)),
          dxfPair(30, cadCoord(p1.startPt.z)),
          dxfPair(40, cadSize(1.9359 * scale)),
          dxfPair(1, "Proposed Pole"),
          dxfPair(50, rotStr),
          dxfPair(41, "0.8"),
          dxfPair(7, "样式 1"),
          ...(sideX < 0
            ? [
                dxfPair(72, 2),
                dxfPair(11, cadCoord(p1.anchorPt.x)),
                dxfPair(21, cadCoord(p1.anchorPt.y)),
                dxfPair(31, cadCoord(p1.anchorPt.z)),
              ]
            : []),
          dxfPair(100, "AcDbAttribute"),
          dxfPair(280, 0),
          dxfPair(2, "PROPOSED-POLE"),
          dxfPair(70, 0),
          dxfPair(280, 0),
        ].join("\n"),
      );

      // ATTRIB SIZE
      entities.push(
        [
          dxfPair(0, "ATTRIB"),
          dxfPair(5, dxfHandle()),
          dxfPair(100, "AcDbEntity"),
          dxfPair(8, "schematic co"),
          dxfPair(62, 1),
          dxfPair(100, "AcDbText"),
          dxfPair(10, cadCoord(p2.startPt.x)),
          dxfPair(20, cadCoord(p2.startPt.y)),
          dxfPair(30, cadCoord(p2.startPt.z)),
          dxfPair(40, cadSize(1.9359 * scale)),
          dxfPair(1, sanitizeDxfText(poleHeight)),
          dxfPair(50, rotStr),
          dxfPair(41, "0.8"),
          dxfPair(7, "样式 1"),
          ...(sideX < 0
            ? [
                dxfPair(72, 2),
                dxfPair(11, cadCoord(p2.anchorPt.x)),
                dxfPair(21, cadCoord(p2.anchorPt.y)),
                dxfPair(31, cadCoord(p2.anchorPt.z)),
              ]
            : []),
          dxfPair(100, "AcDbAttribute"),
          dxfPair(280, 0),
          dxfPair(2, "SIZE"),
          dxfPair(70, 0),
          dxfPair(280, 0),
        ].join("\n"),
      );

      // ATTRIB COORDINATES
      entities.push(
        [
          dxfPair(0, "ATTRIB"),
          dxfPair(5, dxfHandle()),
          dxfPair(100, "AcDbEntity"),
          dxfPair(8, "schematic co"),
          dxfPair(62, 1),
          dxfPair(100, "AcDbText"),
          dxfPair(10, cadCoord(p3.startPt.x)),
          dxfPair(20, cadCoord(p3.startPt.y)),
          dxfPair(30, cadCoord(p3.startPt.z)),
          dxfPair(40, cadSize(1.9359 * scale)),
          dxfPair(1, sanitizeDxfText(latLonStr)),
          dxfPair(50, rotStr),
          dxfPair(41, "0.8"),
          dxfPair(7, "样式 1"),
          ...(sideX < 0
            ? [
                dxfPair(72, 2),
                dxfPair(11, cadCoord(p3.anchorPt.x)),
                dxfPair(21, cadCoord(p3.anchorPt.y)),
                dxfPair(31, cadCoord(p3.anchorPt.z)),
              ]
            : []),
          dxfPair(100, "AcDbAttribute"),
          dxfPair(280, 0),
          dxfPair(2, "COORDINATES"),
          dxfPair(70, 0),
          dxfPair(280, 0),
        ].join("\n"),
      );
    } else if (blockName === "NEW_ELECTRIC_SYSMBOL") {
      let epValue = "NPT";
      let ccValue = "CC";
      if (isStructuredPldt) {
        const structuredInfo = parsePldtStructuredPoleComponents(placemark);
        epValue = structuredInfo.elecLine1;
        ccValue = structuredInfo.ccVal;
      } else {
        const pldtInfo = parsePldtPoleComponents(placemark);
        const owner = detectPoleOwner(placemark);
        epValue = (owner && owner !== "OTHER" && owner !== "ELECTRIC") ? owner : pldtInfo.poleTag;
        if (layer !== "ELECTRIC POLE" && layer !== "P-POLE" && layer !== "POLE PLDT-SMART" && layer !== "PLDT") {
          epValue = layer;
        }
        if (epValue === "PLDT-NPT" || !epValue) epValue = "NPT";
        ccValue = pldtInfo.ccVal;
      }
      const uy1 = slotY === "above" ? 2.4000 : 0.8000;
      const uy2 = slotY === "above" ? 0.4000 : -1.2000;
      const uy3 = slotY === "above" ? -0.8000 : -2.4000;
      const p1 = pldtAttrPlacement(1.9500, uy1, epValue, 2.9358, 0.85);
      const p2 = pldtAttrPlacement(1.9500, uy2, ccValue, 1.8349, 0.85);
      const p3 = pldtAttrPlacement(1.9500, uy3, latLonStr, 0.9174, 0.85);

      // ATTRIB EP
      entities.push(
        [
          dxfPair(0, "ATTRIB"),
          dxfPair(5, dxfHandle()),
          dxfPair(100, "AcDbEntity"),
          dxfPair(8, layer),
          dxfPair(100, "AcDbText"),
          dxfPair(10, cadCoord(p1.startPt.x)),
          dxfPair(20, cadCoord(p1.startPt.y)),
          dxfPair(30, cadCoord(p1.startPt.z)),
          dxfPair(40, cadSize(2.9358 * scale)),
          dxfPair(1, sanitizeDxfText(epValue)),
          dxfPair(50, rotStr),
          dxfPair(7, "样式 1"),
          ...(sideX < 0
            ? [
                dxfPair(72, 2),
                dxfPair(11, cadCoord(p1.anchorPt.x)),
                dxfPair(21, cadCoord(p1.anchorPt.y)),
                dxfPair(31, cadCoord(p1.anchorPt.z)),
              ]
            : []),
          dxfPair(100, "AcDbAttribute"),
          dxfPair(280, 0),
          dxfPair(2, "EP"),
          dxfPair(70, 0),
          dxfPair(280, 0),
        ].join("\n"),
      );

      // ATTRIB CC
      entities.push(
        [
          dxfPair(0, "ATTRIB"),
          dxfPair(5, dxfHandle()),
          dxfPair(100, "AcDbEntity"),
          dxfPair(8, layer),
          dxfPair(100, "AcDbText"),
          dxfPair(10, cadCoord(p2.startPt.x)),
          dxfPair(20, cadCoord(p2.startPt.y)),
          dxfPair(30, cadCoord(p2.startPt.z)),
          dxfPair(40, cadSize(1.8349 * scale)),
          dxfPair(1, sanitizeDxfText(ccValue)),
          dxfPair(50, rotStr),
          dxfPair(7, "样式 1"),
          ...(sideX < 0
            ? [
                dxfPair(72, 2),
                dxfPair(11, cadCoord(p2.anchorPt.x)),
                dxfPair(21, cadCoord(p2.anchorPt.y)),
                dxfPair(31, cadCoord(p2.anchorPt.z)),
              ]
            : []),
          dxfPair(100, "AcDbAttribute"),
          dxfPair(280, 0),
          dxfPair(2, "CC"),
          dxfPair(70, 0),
          dxfPair(280, 0),
        ].join("\n"),
      );

      // ATTRIB COORDINATES
      entities.push(
        [
          dxfPair(0, "ATTRIB"),
          dxfPair(5, dxfHandle()),
          dxfPair(100, "AcDbEntity"),
          dxfPair(8, layer),
          dxfPair(100, "AcDbText"),
          dxfPair(10, cadCoord(p3.startPt.x)),
          dxfPair(20, cadCoord(p3.startPt.y)),
          dxfPair(30, cadCoord(p3.startPt.z)),
          dxfPair(40, cadSize(0.9174 * scale)),
          dxfPair(1, sanitizeDxfText(latLonStr)),
          dxfPair(50, rotStr),
          dxfPair(7, "样式 1"),
          ...(sideX < 0
            ? [
                dxfPair(72, 2),
                dxfPair(11, cadCoord(p3.anchorPt.x)),
                dxfPair(21, cadCoord(p3.anchorPt.y)),
                dxfPair(31, cadCoord(p3.anchorPt.z)),
              ]
            : []),
          dxfPair(100, "AcDbAttribute"),
          dxfPair(280, 0),
          dxfPair(2, "COORDINATES"),
          dxfPair(70, 0),
          dxfPair(280, 0),
        ].join("\n"),
      );
    }

    // SEQEND
    entities.push(
      [
        dxfPair(0, "SEQEND"),
        dxfPair(5, dxfHandle()),
        dxfPair(100, "AcDbEntity"),
        dxfPair(8, layer),
      ].join("\n"),
    );

    // Pole Clamp MTEXT element (CA Clamp VS2/S2/B2/VB2 or GCA Clamp VS3/S3/B3/VB3)
    const clampInfo = resolvePldtPoleClampInfo(placemark, deflectionDeg, provider);
    const clampScale = scale / 1.15;
    const clampLx = (sideX < 0 ? 2.5 : -4.5) * scale;
    const clampLy = 1.0 * scale;
    entities.push(
      entityPoleClampMText(
        clampInfo.layer,
        clampInfo.code,
        {
          x: cadPoint.x + clampLx * cosR - clampLy * sinR,
          y: cadPoint.y + clampLx * sinR + clampLy * cosR,
          z: cadPoint.z,
        },
        2.0 * clampScale,
        16.71311651 * clampScale,
        clampInfo.color,
        clampInfo.trueColor,
        1,
        "STANDARD",
        rotDeg,
      ),
    );

    return entities;
  }

  const blockName = isProposed ? "P-POLE" : isElectric ? "EPOLE" : "PTPOLE";

  const layer: LayerName = placemark.layer || (isProposed
    ? "P-POLE 9.14m CC"
    : isElectric
      ? "EXPOLE"
      : "GLOBE");

  const globeAttrPlacement = (ux: number, uy: number, text: string, hUnscaled: number) => {
    const wUnscaled = estimateUnscaledDxfTextWidth(text, hUnscaled, 1.0);
    const lxStart = (sideX < 0 ? -ux - wUnscaled : ux) * scale;
    const lxAnchor = (sideX < 0 ? -ux : ux) * scale;
    const ly = uy * scale;
    const startPt: CadPoint = {
      x: cadPoint.x + lxStart * cosR - ly * sinR,
      y: cadPoint.y + lxStart * sinR + ly * cosR,
      z: cadPoint.z,
    };
    const anchorPt: CadPoint = {
      x: cadPoint.x + lxAnchor * cosR - ly * sinR,
      y: cadPoint.y + lxAnchor * sinR + ly * cosR,
      z: cadPoint.z,
    };
    return { startPt, anchorPt };
  };

  const entities: string[] = [];

  // INSERT entity (mirrored via X scale when sideX < 0, matching sample DWGs)
  entities.push(
    [
      dxfPair(0, "INSERT"),
      dxfPair(5, dxfHandle()),
      dxfPair(100, "AcDbEntity"),
      dxfPair(8, layer),
      dxfPair(100, "AcDbBlockReference"),
      dxfPair(66, 1),
      dxfPair(2, blockName),
      dxfPair(10, cadCoord(cadPoint.x)),
      dxfPair(20, cadCoord(cadPoint.y)),
      dxfPair(30, cadCoord(cadPoint.z)),
      dxfPair(41, cadSize(sideX * scale)),
      dxfPair(42, cadSize(scale)),
      dxfPair(43, cadSize(scale)),
      dxfPair(50, rotStr),
    ].join("\n"),
  );

  const latLonStr = `${fields.latitude},${fields.longitude}`;

  if (blockName === "PTPOLE") {
    const code = detectPoleCode(placemark);
    const poleNo = rawPoleTag(placemark);
    const poleType = formatRawPoleType(placemark.properties);
    const uy1 = slotY === "above" ? 6.4000 : 1.2000;
    const uy2 = slotY === "above" ? 2.6000 : -2.2000;
    const uy3 = slotY === "above" ? -1.2000 : -5.6000;
    const p1 = globeAttrPlacement(2.5000, uy1, poleNo, 2.3);
    const p2 = globeAttrPlacement(2.5000, uy2, poleType, 2.3);
    const p3 = globeAttrPlacement(2.5000, uy3, latLonStr, 2.3);

    // ATTRIB POLECODE (Centered in circle)
    entities.push(
      [
        dxfPair(0, "ATTRIB"),
        dxfPair(5, dxfHandle()),
        dxfPair(100, "AcDbEntity"),
        dxfPair(8, layer),
        dxfPair(62, 7),
        dxfPair(100, "AcDbText"),
        dxfPair(10, cadCoord(cadPoint.x)),
        dxfPair(20, cadCoord(cadPoint.y)),
        dxfPair(30, cadCoord(cadPoint.z)),
        dxfPair(40, cadSize(2.0 * scale)),
        dxfPair(1, sanitizeDxfText(code)),
        dxfPair(50, rotStr),
        dxfPair(7, "SIMPLEX"),
        dxfPair(72, 4),
        dxfPair(11, cadCoord(cadPoint.x)),
        dxfPair(21, cadCoord(cadPoint.y)),
        dxfPair(31, cadCoord(cadPoint.z)),
        dxfPair(100, "AcDbAttribute"),
        dxfPair(280, 0),
        dxfPair(2, "POLECODE"),
        dxfPair(70, 0),
        dxfPair(280, 0),
      ].join("\n"),
    );

    // ATTRIB POLNO
    entities.push(
      [
        dxfPair(0, "ATTRIB"),
        dxfPair(5, dxfHandle()),
        dxfPair(100, "AcDbEntity"),
        dxfPair(8, layer),
        dxfPair(62, 7),
        dxfPair(100, "AcDbText"),
        dxfPair(10, cadCoord(p1.startPt.x)),
        dxfPair(20, cadCoord(p1.startPt.y)),
        dxfPair(30, cadCoord(p1.startPt.z)),
        dxfPair(40, cadSize(2.3 * scale)),
        dxfPair(1, sanitizeDxfText(poleNo)),
        dxfPair(50, rotStr),
        dxfPair(7, "SIMPLEX"),
        ...(sideX < 0
          ? [
              dxfPair(72, 2),
              dxfPair(11, cadCoord(p1.anchorPt.x)),
              dxfPair(21, cadCoord(p1.anchorPt.y)),
              dxfPair(31, cadCoord(p1.anchorPt.z)),
            ]
          : []),
        dxfPair(100, "AcDbAttribute"),
        dxfPair(280, 0),
        dxfPair(2, "POLNO"),
        dxfPair(70, 0),
        dxfPair(280, 0),
      ].join("\n"),
    );

    // ATTRIB POLTYP
    entities.push(
      [
        dxfPair(0, "ATTRIB"),
        dxfPair(5, dxfHandle()),
        dxfPair(100, "AcDbEntity"),
        dxfPair(8, layer),
        dxfPair(62, 7),
        dxfPair(100, "AcDbText"),
        dxfPair(10, cadCoord(p2.startPt.x)),
        dxfPair(20, cadCoord(p2.startPt.y)),
        dxfPair(30, cadCoord(p2.startPt.z)),
        dxfPair(40, cadSize(2.3 * scale)),
        dxfPair(1, sanitizeDxfText(poleType)),
        dxfPair(50, rotStr),
        dxfPair(7, "SIMPLEX"),
        ...(sideX < 0
          ? [
              dxfPair(72, 2),
              dxfPair(11, cadCoord(p2.anchorPt.x)),
              dxfPair(21, cadCoord(p2.anchorPt.y)),
              dxfPair(31, cadCoord(p2.anchorPt.z)),
            ]
          : []),
        dxfPair(100, "AcDbAttribute"),
        dxfPair(280, 0),
        dxfPair(2, "POLTYP"),
        dxfPair(70, 0),
        dxfPair(280, 0),
      ].join("\n"),
    );

    // ATTRIB DA
    entities.push(
      [
        dxfPair(0, "ATTRIB"),
        dxfPair(5, dxfHandle()),
        dxfPair(100, "AcDbEntity"),
        dxfPair(8, layer),
        dxfPair(62, 7),
        dxfPair(100, "AcDbText"),
        dxfPair(10, cadCoord(p3.startPt.x)),
        dxfPair(20, cadCoord(p3.startPt.y)),
        dxfPair(30, cadCoord(p3.startPt.z)),
        dxfPair(40, cadSize(2.3 * scale)),
        dxfPair(1, sanitizeDxfText(latLonStr)),
        dxfPair(50, rotStr),
        dxfPair(7, "SIMPLEX"),
        ...(sideX < 0
          ? [
              dxfPair(72, 2),
              dxfPair(11, cadCoord(p3.anchorPt.x)),
              dxfPair(21, cadCoord(p3.anchorPt.y)),
              dxfPair(31, cadCoord(p3.anchorPt.z)),
            ]
          : []),
        dxfPair(100, "AcDbAttribute"),
        dxfPair(280, 0),
        dxfPair(2, "DA"),
        dxfPair(70, 0),
        dxfPair(280, 0),
      ].join("\n"),
    );
  } else if (blockName === "EPOLE") {
    let owner = cleanFieldValue(fields.owner) === "OTHER" ? "" : fields.owner;
    if (!owner && layer !== "EXPOLE" && layer !== "P-POLE 9.14m CC" && layer !== "GLOBE" && layer !== "X-POLE") {
      owner = layer;
    }
    const poleNo = rawPoleTag(placemark);
    const poleType = formatRawPoleType(placemark.properties);
    const uy1 = slotY === "above" ? 7.0631 : 1.8500;
    const uy2 = slotY === "above" ? 4.0170 : -1.1337;
    const uy3 = slotY === "above" ? 1.1337 : -4.0170;
    const uy4 = slotY === "above" ? -1.8500 : -7.0631;
    const p1 = globeAttrPlacement(2.3375, uy1, owner, 2.3);
    const p2 = globeAttrPlacement(2.3375, uy2, poleNo, 2.3);
    const p3 = globeAttrPlacement(2.3375, uy3, poleType, 2.3);
    const p4 = globeAttrPlacement(2.3375, uy4, latLonStr, 2.3);

    // ATTRIB OWNER (aligned with POLNO, TYPE, DA)
    entities.push(
      [
        dxfPair(0, "ATTRIB"),
        dxfPair(5, dxfHandle()),
        dxfPair(100, "AcDbEntity"),
        dxfPair(8, layer),
        dxfPair(62, 7),
        dxfPair(100, "AcDbText"),
        dxfPair(10, cadCoord(p1.startPt.x)),
        dxfPair(20, cadCoord(p1.startPt.y)),
        dxfPair(30, cadCoord(p1.startPt.z)),
        dxfPair(40, cadSize(2.3 * scale)),
        dxfPair(1, sanitizeDxfText(owner)),
        dxfPair(50, rotStr),
        dxfPair(7, "SIMPLEX"),
        ...(sideX < 0
          ? [
              dxfPair(72, 2),
              dxfPair(11, cadCoord(p1.anchorPt.x)),
              dxfPair(21, cadCoord(p1.anchorPt.y)),
              dxfPair(31, cadCoord(p1.anchorPt.z)),
            ]
          : []),
        dxfPair(100, "AcDbAttribute"),
        dxfPair(280, 0),
        dxfPair(2, "OWNER"),
        dxfPair(70, 0),
        dxfPair(280, 0),
      ].join("\n"),
    );

    // ATTRIB POLNO
    entities.push(
      [
        dxfPair(0, "ATTRIB"),
        dxfPair(5, dxfHandle()),
        dxfPair(100, "AcDbEntity"),
        dxfPair(8, layer),
        dxfPair(62, 7),
        dxfPair(100, "AcDbText"),
        dxfPair(10, cadCoord(p2.startPt.x)),
        dxfPair(20, cadCoord(p2.startPt.y)),
        dxfPair(30, cadCoord(p2.startPt.z)),
        dxfPair(40, cadSize(2.3 * scale)),
        dxfPair(1, sanitizeDxfText(poleNo)),
        dxfPair(50, rotStr),
        dxfPair(7, "SIMPLEX"),
        ...(sideX < 0
          ? [
              dxfPair(72, 2),
              dxfPair(11, cadCoord(p2.anchorPt.x)),
              dxfPair(21, cadCoord(p2.anchorPt.y)),
              dxfPair(31, cadCoord(p2.anchorPt.z)),
            ]
          : []),
        dxfPair(100, "AcDbAttribute"),
        dxfPair(280, 0),
        dxfPair(2, "POLNO"),
        dxfPair(70, 0),
        dxfPair(280, 0),
      ].join("\n"),
    );

    // ATTRIB TYPE
    entities.push(
      [
        dxfPair(0, "ATTRIB"),
        dxfPair(5, dxfHandle()),
        dxfPair(100, "AcDbEntity"),
        dxfPair(8, layer),
        dxfPair(62, 7),
        dxfPair(100, "AcDbText"),
        dxfPair(10, cadCoord(p3.startPt.x)),
        dxfPair(20, cadCoord(p3.startPt.y)),
        dxfPair(30, cadCoord(p3.startPt.z)),
        dxfPair(40, cadSize(2.3 * scale)),
        dxfPair(1, sanitizeDxfText(poleType)),
        dxfPair(50, rotStr),
        dxfPair(7, "SIMPLEX"),
        ...(sideX < 0
          ? [
              dxfPair(72, 2),
              dxfPair(11, cadCoord(p3.anchorPt.x)),
              dxfPair(21, cadCoord(p3.anchorPt.y)),
              dxfPair(31, cadCoord(p3.anchorPt.z)),
            ]
          : []),
        dxfPair(100, "AcDbAttribute"),
        dxfPair(280, 0),
        dxfPair(2, "TYPE"),
        dxfPair(70, 0),
        dxfPair(280, 0),
      ].join("\n"),
    );

    // ATTRIB DA
    entities.push(
      [
        dxfPair(0, "ATTRIB"),
        dxfPair(5, dxfHandle()),
        dxfPair(100, "AcDbEntity"),
        dxfPair(8, layer),
        dxfPair(62, 7),
        dxfPair(100, "AcDbText"),
        dxfPair(10, cadCoord(p4.startPt.x)),
        dxfPair(20, cadCoord(p4.startPt.y)),
        dxfPair(30, cadCoord(p4.startPt.z)),
        dxfPair(40, cadSize(2.3 * scale)),
        dxfPair(1, sanitizeDxfText(latLonStr)),
        dxfPair(50, rotStr),
        dxfPair(7, "SIMPLEX"),
        ...(sideX < 0
          ? [
              dxfPair(72, 2),
              dxfPair(11, cadCoord(p4.anchorPt.x)),
              dxfPair(21, cadCoord(p4.anchorPt.y)),
              dxfPair(31, cadCoord(p4.anchorPt.z)),
            ]
          : []),
        dxfPair(100, "AcDbAttribute"),
        dxfPair(280, 0),
        dxfPair(2, "DA"),
        dxfPair(70, 0),
        dxfPair(280, 0),
      ].join("\n"),
    );
  } else if (blockName === "P-POLE") {
    const poleNo = rawPoleTag(placemark) || "PROPOSED POLE";
    const poleType = formatRawPoleType(placemark.properties);
    const poleHeight = resolveGlobeProposedPoleHeight(placemark);
    const uy1 = slotY === "above" ? 7.0631 : 1.8500;
    const uy2 = slotY === "above" ? 4.0170 : -1.1337;
    const uy3 = slotY === "above" ? 1.1337 : -4.0170;
    const uy4 = slotY === "above" ? -1.8500 : -7.0631;
    const p1 = globeAttrPlacement(2.3375, uy1, poleNo, 2.0);
    const p2 = globeAttrPlacement(2.3375, uy2, poleType, 2.0);
    const p3 = globeAttrPlacement(2.3375, uy3, poleHeight, 2.0);
    const p4 = globeAttrPlacement(2.3375, uy4, latLonStr, 2.0);

    // ATTRIB POLNO (Line 1: PROPOSED POLE)
    entities.push(
      [
        dxfPair(0, "ATTRIB"),
        dxfPair(5, dxfHandle()),
        dxfPair(100, "AcDbEntity"),
        dxfPair(8, layer),
        dxfPair(62, 10),
        dxfPair(100, "AcDbText"),
        dxfPair(10, cadCoord(p1.startPt.x)),
        dxfPair(20, cadCoord(p1.startPt.y)),
        dxfPair(30, cadCoord(p1.startPt.z)),
        dxfPair(40, cadSize(2.0 * scale)),
        dxfPair(1, sanitizeDxfText(poleNo)),
        dxfPair(50, rotStr),
        dxfPair(7, "ROMANS"),
        ...(sideX < 0
          ? [
              dxfPair(72, 2),
              dxfPair(11, cadCoord(p1.anchorPt.x)),
              dxfPair(21, cadCoord(p1.anchorPt.y)),
              dxfPair(31, cadCoord(p1.anchorPt.z)),
            ]
          : []),
        dxfPair(100, "AcDbAttribute"),
        dxfPair(280, 0),
        dxfPair(2, "POLNO"),
        dxfPair(70, 0),
        dxfPair(280, 0),
      ].join("\n"),
    );

    // ATTRIB POLTYP (Line 2: CC / ST / WO)
    entities.push(
      [
        dxfPair(0, "ATTRIB"),
        dxfPair(5, dxfHandle()),
        dxfPair(100, "AcDbEntity"),
        dxfPair(8, layer),
        dxfPair(62, 10),
        dxfPair(100, "AcDbText"),
        dxfPair(10, cadCoord(p2.startPt.x)),
        dxfPair(20, cadCoord(p2.startPt.y)),
        dxfPair(30, cadCoord(p2.startPt.z)),
        dxfPair(40, cadSize(2.0 * scale)),
        dxfPair(1, sanitizeDxfText(poleType)),
        dxfPair(50, rotStr),
        dxfPair(7, "ROMANS"),
        ...(sideX < 0
          ? [
              dxfPair(72, 2),
              dxfPair(11, cadCoord(p2.anchorPt.x)),
              dxfPair(21, cadCoord(p2.anchorPt.y)),
              dxfPair(31, cadCoord(p2.anchorPt.z)),
            ]
          : []),
        dxfPair(100, "AcDbAttribute"),
        dxfPair(280, 0),
        dxfPair(2, "POLTYP"),
        dxfPair(70, 0),
        dxfPair(280, 0),
      ].join("\n"),
    );

    // ATTRIB POLHYT (Line 3: 7.5m / 9.0m)
    entities.push(
      [
        dxfPair(0, "ATTRIB"),
        dxfPair(5, dxfHandle()),
        dxfPair(100, "AcDbEntity"),
        dxfPair(8, layer),
        dxfPair(62, 10),
        dxfPair(100, "AcDbText"),
        dxfPair(10, cadCoord(p3.startPt.x)),
        dxfPair(20, cadCoord(p3.startPt.y)),
        dxfPair(30, cadCoord(p3.startPt.z)),
        dxfPair(40, cadSize(2.0 * scale)),
        dxfPair(1, sanitizeDxfText(poleHeight)),
        dxfPair(50, rotStr),
        dxfPair(7, "ROMANS"),
        ...(sideX < 0
          ? [
              dxfPair(72, 2),
              dxfPair(11, cadCoord(p3.anchorPt.x)),
              dxfPair(21, cadCoord(p3.anchorPt.y)),
              dxfPair(31, cadCoord(p3.anchorPt.z)),
            ]
          : []),
        dxfPair(100, "AcDbAttribute"),
        dxfPair(280, 0),
        dxfPair(2, "POLHYT"),
        dxfPair(70, 0),
        dxfPair(280, 0),
      ].join("\n"),
    );

    // ATTRIB COORDINATES (Line 4: lat,lon)
    entities.push(
      [
        dxfPair(0, "ATTRIB"),
        dxfPair(5, dxfHandle()),
        dxfPair(100, "AcDbEntity"),
        dxfPair(8, layer),
        dxfPair(62, 10),
        dxfPair(100, "AcDbText"),
        dxfPair(10, cadCoord(p4.startPt.x)),
        dxfPair(20, cadCoord(p4.startPt.y)),
        dxfPair(30, cadCoord(p4.startPt.z)),
        dxfPair(40, cadSize(2.0 * scale)),
        dxfPair(1, sanitizeDxfText(latLonStr)),
        dxfPair(50, rotStr),
        dxfPair(7, "ROMANS"),
        ...(sideX < 0
          ? [
              dxfPair(72, 2),
              dxfPair(11, cadCoord(p4.anchorPt.x)),
              dxfPair(21, cadCoord(p4.anchorPt.y)),
              dxfPair(31, cadCoord(p4.anchorPt.z)),
            ]
          : []),
        dxfPair(100, "AcDbAttribute"),
        dxfPair(280, 0),
        dxfPair(2, "COORDINATES"),
        dxfPair(70, 0),
        dxfPair(280, 0),
      ].join("\n"),
    );
  }

  // SEQEND
  entities.push(
    [
      dxfPair(0, "SEQEND"),
      dxfPair(5, dxfHandle()),
      dxfPair(100, "AcDbEntity"),
      dxfPair(8, layer),
    ].join("\n"),
  );

  return entities;
}

function entityNapBlockInsertWithAttributes(
  placemark: ClassifiedNapPlacemark,
  cadPoint: CadPoint,
  standard: HldNapStandard,
  usesRawCoordinates: boolean,
) {
  const scale = usesRawCoordinates ? 0.00001 : standard.stencilScale || 1.0;
  const folder = placemark.properties.Folder || placemark.properties._folder || "";
  const isExisting = placemark.status === "EXISTING";
  const isDummy =
    Boolean(placemark.isDummy) ||
    placemark.status === "DUMMY" ||
    isDummyNapIdentifier(placemark.name, folder);
  const is8Lines =
    standard.stencilStyle === "lines8p" ||
    placemark.splitter === "1:8" ||
    placemark.splitter === "2:8" ||
    placemark.ports === 8 ||
    /(\b|_)(8[\s\-_]*(?:lines?|ports?|p)|1[:\/]8)(\b|_)/i.test(
      `${placemark.name || ""} ${placemark.napId || ""} ${placemark.description || ""}`,
    );

  let blockName = "GLOBE NAP PROPOSED";
  if (standard.stencilStyle === "telcoBlock") {
    if (standard.telcoProvider === "pldt") {
      blockName = "NEW_PLDT_NAP_SYMBOL";
    } else {
      blockName = isDummy
        ? isExisting
          ? "GLOBE NAP DUMMY EXISTING"
          : "GLOBE NAP DUMMY"
        : isExisting
          ? is8Lines
            ? "GLOBE NAP 8-LINES EXISTING"
            : "GLOBE NAP EXISTING"
          : is8Lines
            ? "GLOBE NAP 8-LINES"
            : "GLOBE NAP PROPOSED";
    }
  } else if (standard.stencilStyle === "lines8p") {
    blockName = isDummy
      ? isExisting
        ? "GLOBE NAP DUMMY EXISTING"
        : "GLOBE NAP DUMMY"
      : isExisting
        ? "GLOBE NAP 8-LINES EXISTING"
        : "GLOBE NAP 8-LINES";
  } else if (standard.stencilStyle === "box8p") {
    blockName = "NAP_8PORT";
  } else if (standard.stencilStyle === "hex16p") {
    blockName = "NAP_16PORT";
  } else if (standard.stencilStyle === "splitter") {
    blockName = "NAP_SPLITTER";
  } else {
    blockName =
      standard.telcoProvider === "pldt"
        ? "NEW_PLDT_NAP_SYMBOL"
        : isDummy
          ? isExisting
            ? "GLOBE NAP DUMMY EXISTING"
            : "GLOBE NAP DUMMY"
          : isExisting
            ? is8Lines
              ? "GLOBE NAP 8-LINES EXISTING"
              : "GLOBE NAP EXISTING"
            : is8Lines
              ? "GLOBE NAP 8-LINES"
              : "GLOBE NAP PROPOSED";
  }

  const resolvedSpecificLayer = resolveHldNapLayer(
    placemark,
    standard,
    0,
    placemark.status,
    isDummy,
    placemark.splitter,
    placemark.ports,
    placemark.napId,
  );

  const layer: LayerName =
    placemark.layer === "OLT_POI"
      ? "OLT_POI"
      : (placemark.layer &&
         (placemark.layer.startsWith("NEW NAP") ||
          placemark.layer.startsWith("EXISTING NAP") ||
          placemark.layer.includes("DUMMY")))
        ? placemark.layer
        : resolvedSpecificLayer;

  const colorCode =
    placemark.layer === "OLT_POI"
      ? 5
      : isExisting
        ? 5
        : isDummy
          ? (isExisting ? 5 : 1)
          : 1;

  const entities: string[] = [];

  // INSERT entity
  entities.push(
    [
      dxfPair(0, "INSERT"),
      dxfPair(5, dxfHandle()),
      dxfPair(100, "AcDbEntity"),
      dxfPair(8, layer),
      dxfPair(62, colorCode),
      dxfPair(100, "AcDbBlockReference"),
      dxfPair(66, 1),
      dxfPair(2, blockName),
      dxfPair(10, cadCoord(cadPoint.x)),
      dxfPair(20, cadCoord(cadPoint.y)),
      dxfPair(30, cadCoord(cadPoint.z)),
      dxfPair(41, cadSize(scale)),
      dxfPair(42, cadSize(scale)),
      dxfPair(43, cadSize(scale)),
    ].join("\n"),
  );

  const coords = placemark.geometry.type === "Point" ? placemark.geometry.coordinates : { lon: 0, lat: 0 };
  const latLonStr = `${coords.lat.toFixed(6)}, ${coords.lon.toFixed(6)}`;

  if (
    blockName === "GLOBE NAP PROPOSED" ||
    blockName === "GLOBE NAP EXISTING" ||
    blockName === "GLOBE NAP 8-LINES" ||
    blockName === "GLOBE NAP 8-LINES EXISTING" ||
    blockName === "SINGLE NAP 2" ||
    blockName === "GLOBE NAP DUMMY" ||
    blockName === "GLOBE NAP DUMMY EXISTING" ||
    blockName === "CONVERGE NAP PROPOSED" ||
    blockName === "Dummy NAP"
  ) {
    const line1 = sanitizeDxfText(placemark.napId);
    const line2 = isExisting ? "SOURCE EXISTING NAP" : "NAP AUGMENT";
    const attribLayer: LayerName = layer;
    const attribColor = colorCode;

    // ATTRIB MHTYPE (Line 1 - NAP ID)
    entities.push(
      [
        dxfPair(0, "ATTRIB"),
        dxfPair(5, dxfHandle()),
        dxfPair(100, "AcDbEntity"),
        dxfPair(8, attribLayer),
        dxfPair(62, attribColor),
        dxfPair(100, "AcDbText"),
        dxfPair(10, cadCoord(cadPoint.x - 3.8816 * scale)),
        dxfPair(20, cadCoord(cadPoint.y + 3.0247 * scale)),
        dxfPair(30, cadCoord(cadPoint.z)),
        dxfPair(40, cadSize(1.65 * scale)),
        dxfPair(1, line1),
        dxfPair(7, "BOLD"),
        dxfPair(72, 1),
        dxfPair(11, cadCoord(cadPoint.x - 0.0713 * scale)),
        dxfPair(21, cadCoord(cadPoint.y + 2.4748 * scale)),
        dxfPair(31, cadCoord(cadPoint.z)),
        dxfPair(100, "AcDbAttribute"),
        dxfPair(280, 0),
        dxfPair(2, "MHTYPE"),
        dxfPair(70, 0),
        dxfPair(74, 1),
        dxfPair(280, 0),
      ].join("\n"),
    );

    // ATTRIB MHNO (Line 2 - NAP AUGMENT / Splitter)
    entities.push(
      [
        dxfPair(0, "ATTRIB"),
        dxfPair(5, dxfHandle()),
        dxfPair(100, "AcDbEntity"),
        dxfPair(8, attribLayer),
        dxfPair(62, attribColor),
        dxfPair(100, "AcDbText"),
        dxfPair(10, cadCoord(cadPoint.x - 6.7884 * scale)),
        dxfPair(20, cadCoord(cadPoint.y + 5.4994 * scale)),
        dxfPair(30, cadCoord(cadPoint.z)),
        dxfPair(40, cadSize(1.65 * scale)),
        dxfPair(1, line2),
        dxfPair(7, "BOLD"),
        dxfPair(72, 1),
        dxfPair(11, cadCoord(cadPoint.x - 0.0713 * scale)),
        dxfPair(21, cadCoord(cadPoint.y + 4.9495 * scale)),
        dxfPair(31, cadCoord(cadPoint.z)),
        dxfPair(100, "AcDbAttribute"),
        dxfPair(280, 0),
        dxfPair(2, "MHNO"),
        dxfPair(70, 0),
        dxfPair(74, 1),
        dxfPair(280, 0),
      ].join("\n"),
    );
  } else if (blockName === "NEW_PLDT_NAP_SYMBOL") {
    // ATTRIB PLDT_NAP
    entities.push(
      [
        dxfPair(0, "ATTRIB"),
        dxfPair(5, dxfHandle()),
        dxfPair(100, "AcDbEntity"),
        dxfPair(8, "NAP_LABELS"),
        dxfPair(62, 2),
        dxfPair(100, "AcDbText"),
        dxfPair(10, cadCoord(cadPoint.x + 2.2 * scale)),
        dxfPair(20, cadCoord(cadPoint.y + 0.8 * scale)),
        dxfPair(30, cadCoord(cadPoint.z)),
        dxfPair(40, cadSize(1.5 * scale)),
        dxfPair(1, sanitizeDxfText(placemark.napId)),
        dxfPair(7, "SIMPLEX"),
        dxfPair(100, "AcDbAttribute"),
        dxfPair(2, "PLDT_NAP"),
        dxfPair(70, 0),
      ].join("\n"),
    );

    // ATTRIB SPLITTER
    entities.push(
      [
        dxfPair(0, "ATTRIB"),
        dxfPair(5, dxfHandle()),
        dxfPair(100, "AcDbEntity"),
        dxfPair(8, "NAP_LABELS"),
        dxfPair(62, 2),
        dxfPair(100, "AcDbText"),
        dxfPair(10, cadCoord(cadPoint.x + 2.2 * scale)),
        dxfPair(20, cadCoord(cadPoint.y - 0.7 * scale)),
        dxfPair(30, cadCoord(cadPoint.z)),
        dxfPair(40, cadSize(1.2 * scale)),
        dxfPair(1, sanitizeDxfText(`${placemark.splitter} (${placemark.ports}P)`)),
        dxfPair(7, "SIMPLEX"),
        dxfPair(100, "AcDbAttribute"),
        dxfPair(2, "SPLITTER"),
        dxfPair(70, 0),
      ].join("\n"),
    );

    // ATTRIB POLE_TAG
    entities.push(
      [
        dxfPair(0, "ATTRIB"),
        dxfPair(5, dxfHandle()),
        dxfPair(100, "AcDbEntity"),
        dxfPair(8, "NAP_LABELS"),
        dxfPair(62, 7),
        dxfPair(100, "AcDbText"),
        dxfPair(10, cadCoord(cadPoint.x + 2.2 * scale)),
        dxfPair(20, cadCoord(cadPoint.y - 2.0 * scale)),
        dxfPair(30, cadCoord(cadPoint.z)),
        dxfPair(40, cadSize(1.0 * scale)),
        dxfPair(1, sanitizeDxfText(placemark.poleRef || "-")),
        dxfPair(7, "SIMPLEX"),
        dxfPair(100, "AcDbAttribute"),
        dxfPair(2, "POLE_TAG"),
        dxfPair(70, 0),
      ].join("\n"),
    );

    // ATTRIB COORDINATES
    entities.push(
      [
        dxfPair(0, "ATTRIB"),
        dxfPair(5, dxfHandle()),
        dxfPair(100, "AcDbEntity"),
        dxfPair(8, "NAP_LABELS"),
        dxfPair(62, 8),
        dxfPair(100, "AcDbText"),
        dxfPair(10, cadCoord(cadPoint.x + 2.2 * scale)),
        dxfPair(20, cadCoord(cadPoint.y - 3.1 * scale)),
        dxfPair(30, cadCoord(cadPoint.z)),
        dxfPair(40, cadSize(0.85 * scale)),
        dxfPair(1, sanitizeDxfText(latLonStr)),
        dxfPair(7, "SIMPLEX"),
        dxfPair(100, "AcDbAttribute"),
        dxfPair(2, "COORDINATES"),
        dxfPair(70, 0),
      ].join("\n"),
    );
  } else {
    // ATTRIB NAP_ID
    entities.push(
      [
        dxfPair(0, "ATTRIB"),
        dxfPair(5, dxfHandle()),
        dxfPair(100, "AcDbEntity"),
        dxfPair(8, "NAP_LABELS"),
        dxfPair(62, 2),
        dxfPair(100, "AcDbText"),
        dxfPair(10, cadCoord(cadPoint.x + 2.2 * scale)),
        dxfPair(20, cadCoord(cadPoint.y + 0.8 * scale)),
        dxfPair(30, cadCoord(cadPoint.z)),
        dxfPair(40, cadSize(1.5 * scale)),
        dxfPair(1, sanitizeDxfText(placemark.napId)),
        dxfPair(7, "SIMPLEX"),
        dxfPair(100, "AcDbAttribute"),
        dxfPair(2, "NAP_ID"),
        dxfPair(70, 0),
      ].join("\n"),
    );

    // ATTRIB SPLITTER
    entities.push(
      [
        dxfPair(0, "ATTRIB"),
        dxfPair(5, dxfHandle()),
        dxfPair(100, "AcDbEntity"),
        dxfPair(8, "NAP_LABELS"),
        dxfPair(62, 2),
        dxfPair(100, "AcDbText"),
        dxfPair(10, cadCoord(cadPoint.x + 2.2 * scale)),
        dxfPair(20, cadCoord(cadPoint.y - 0.7 * scale)),
        dxfPair(30, cadCoord(cadPoint.z)),
        dxfPair(40, cadSize(1.2 * scale)),
        dxfPair(1, sanitizeDxfText(`${placemark.splitter} (${placemark.ports}P)`)),
        dxfPair(7, "SIMPLEX"),
        dxfPair(100, "AcDbAttribute"),
        dxfPair(2, "SPLITTER"),
        dxfPair(70, 0),
      ].join("\n"),
    );

    // ATTRIB POLE_TAG
    entities.push(
      [
        dxfPair(0, "ATTRIB"),
        dxfPair(5, dxfHandle()),
        dxfPair(100, "AcDbEntity"),
        dxfPair(8, "NAP_LABELS"),
        dxfPair(62, 7),
        dxfPair(100, "AcDbText"),
        dxfPair(10, cadCoord(cadPoint.x + 2.2 * scale)),
        dxfPair(20, cadCoord(cadPoint.y - 2.0 * scale)),
        dxfPair(30, cadCoord(cadPoint.z)),
        dxfPair(40, cadSize(1.0 * scale)),
        dxfPair(1, sanitizeDxfText(placemark.poleRef || "-")),
        dxfPair(7, "SIMPLEX"),
        dxfPair(100, "AcDbAttribute"),
        dxfPair(2, "POLE_TAG"),
        dxfPair(70, 0),
      ].join("\n"),
    );

    // ATTRIB COORDINATES
    entities.push(
      [
        dxfPair(0, "ATTRIB"),
        dxfPair(5, dxfHandle()),
        dxfPair(100, "AcDbEntity"),
        dxfPair(8, "NAP_LABELS"),
        dxfPair(62, 8),
        dxfPair(100, "AcDbText"),
        dxfPair(10, cadCoord(cadPoint.x + 2.2 * scale)),
        dxfPair(20, cadCoord(cadPoint.y - 3.1 * scale)),
        dxfPair(30, cadCoord(cadPoint.z)),
        dxfPair(40, cadSize(0.85 * scale)),
        dxfPair(1, sanitizeDxfText(latLonStr)),
        dxfPair(7, "SIMPLEX"),
        dxfPair(100, "AcDbAttribute"),
        dxfPair(2, "COORDINATES"),
        dxfPair(70, 0),
      ].join("\n"),
    );
  }

  // SEQEND
  entities.push(
    [
      dxfPair(0, "SEQEND"),
      dxfPair(5, dxfHandle()),
      dxfPair(100, "AcDbEntity"),
      dxfPair(8, layer),
    ].join("\n"),
  );

  return entities;
}

function distance(start: CadPoint, end: CadPoint) {
  return Math.hypot(end.x - start.x, end.y - start.y);
}

function haversineDistance(p1: LonLat, p2: LonLat): number {
  const R = 6378137;
  const dLat = ((p2.lat - p1.lat) * Math.PI) / 180;
  const dLon = ((p2.lon - p1.lon) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((p1.lat * Math.PI) / 180) * Math.cos((p2.lat * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function interpolate(start: CadPoint, end: CadPoint, amount: number): CadPoint {
  return {
    x: start.x + (end.x - start.x) * amount,
    y: start.y + (end.y - start.y) * amount,
    z: start.z + (end.z - start.z) * amount,
  };
}

function addScaled(point: CadPoint, vector: CadPoint, scale: number): CadPoint {
  return { x: point.x + vector.x * scale, y: point.y + vector.y * scale, z: point.z };
}

function segmentDistance(point: CadPoint, start: CadPoint, end: CadPoint) {
  const segmentLengthSq = (end.x - start.x) ** 2 + (end.y - start.y) ** 2;
  if (segmentLengthSq === 0) return distance(point, start);
  const amount = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * (end.x - start.x) + (point.y - start.y) * (end.y - start.y)) / segmentLengthSq),
  );
  return distance(point, interpolate(start, end, amount));
}

function orderedPolePath(points: CadPoint[]) {
  if (points.length <= 2) return points;

  const remaining = [...points];
  const startIndex = remaining.reduce((bestIndex, point, index) => {
    const best = remaining[bestIndex];
    return point.x + point.y < best.x + best.y ? index : bestIndex;
  }, 0);
  const path = [remaining.splice(startIndex, 1)[0]];

  while (remaining.length) {
    const last = path[path.length - 1];
    const nextIndex = remaining.reduce((bestIndex, point, index) => {
      return distance(last, point) < distance(last, remaining[bestIndex]) ? index : bestIndex;
    }, 0);
    path.push(remaining.splice(nextIndex, 1)[0]);
  }

  return path;
}

function orientation(a: CadPoint, b: CadPoint, c: CadPoint) {
  const value = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
  if (Math.abs(value) < 0.0001) return 0;
  return value > 0 ? 1 : 2;
}

function segmentsIntersect(a: CadPoint, b: CadPoint, c: CadPoint, d: CadPoint) {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  return o1 !== o2 && o3 !== o4;
}

function segmentToSegmentDistance(a: CadPoint, b: CadPoint, c: CadPoint, d: CadPoint) {
  if (segmentsIntersect(a, b, c, d)) return 0;
  return Math.min(segmentDistance(a, c, d), segmentDistance(b, c, d), segmentDistance(c, a, b), segmentDistance(d, a, b));
}

function createPoleGeofence(
  placemarks: ClassifiedPlacemark[],
  project: (point: LonLat) => CadPoint,
  corridorBufferMeters = 35,
  bufferMeters = 300,
): PoleGeofence | null {
  const points = placemarks
    .filter((placemark) => placemark.geometry.type === "Point")
    .map((placemark) => project((placemark.geometry as Extract<Geometry, { type: "Point" }>).coordinates));

  if (!points.length) return null;
  const path = orderedPolePath(points);

  const cableSegments: Array<{ start: CadPoint; end: CadPoint }> = [];
  placemarks
    .filter(
      (placemark) =>
        placemark.geometry.type === "LineString" &&
        (placemark.layer === "CABLE_ROUTES" ||
          placemark.layer === "SPAN" ||
          placemark.layer === "SOURCE_LINES" ||
          placemark.layer === "FEEDER_CABLES"),
    )
    .forEach((placemark) => {
      const lineCoords = (placemark.geometry as Extract<Geometry, { type: "LineString" }>).coordinates.map(project);
      for (let i = 0; i < lineCoords.length - 1; i += 1) {
        cableSegments.push({ start: lineCoords[i], end: lineCoords[i + 1] });
      }
    });

  if (!cableSegments.length && path.length > 1) {
    for (let i = 0; i < path.length - 1; i += 1) {
      cableSegments.push({ start: path[i], end: path[i + 1] });
    }
  }

  return {
    points,
    path,
    cableSegments,
    minX: Math.min(...points.map((point) => point.x)) - bufferMeters,
    minY: Math.min(...points.map((point) => point.y)) - bufferMeters,
    maxX: Math.max(...points.map((point) => point.x)) + bufferMeters,
    maxY: Math.max(...points.map((point) => point.y)) + bufferMeters,
    bufferMeters,
    corridorBufferMeters,
    traverseBufferMeters: 150,
    poleFallbackMeters: 300,
  };
}

function pointInsideGeofence(point: CadPoint, geofence: PoleGeofence) {
  return point.x >= geofence.minX && point.x <= geofence.maxX && point.y >= geofence.minY && point.y <= geofence.maxY;
}

function segmentInsideGeofence(start: CadPoint, end: CadPoint, geofence: PoleGeofence, maxDist = geofence.corridorBufferMeters || 35) {
  const segMinX = Math.min(start.x, end.x);
  const segMaxX = Math.max(start.x, end.x);
  const segMinY = Math.min(start.y, end.y);
  const segMaxY = Math.max(start.y, end.y);

  if (
    segMaxX < geofence.minX ||
    segMinX > geofence.maxX ||
    segMaxY < geofence.minY ||
    segMinY > geofence.maxY
  ) {
    return false;
  }

  for (let i = 0; i < geofence.points.length; i += 1) {
    if (segmentDistance(geofence.points[i], start, end) <= maxDist) {
      return true;
    }
  }

  for (let i = 0; i < geofence.cableSegments.length; i += 1) {
    const seg = geofence.cableSegments[i];
    if (segmentToSegmentDistance(start, end, seg.start, seg.end) <= maxDist) {
      return true;
    }
  }

  return false;
}

function normalizeAngleDelta(delta: number) {
  while (delta <= -Math.PI) delta += Math.PI * 2;
  while (delta > Math.PI) delta -= Math.PI * 2;
  return delta;
}

function pushDistinct(points: CadPoint[], point: CadPoint, tolerance = 0.01) {
  const last = points[points.length - 1];
  if (!last || distance(last, point) > tolerance) points.push(point);
}

function lineIntersection(a1: CadPoint, a2: CadPoint, b1: CadPoint, b2: CadPoint): CadPoint | null {
  const aDx = a2.x - a1.x;
  const aDy = a2.y - a1.y;
  const bDx = b2.x - b1.x;
  const bDy = b2.y - b1.y;
  const denominator = aDx * bDy - aDy * bDx;
  if (Math.abs(denominator) < 0.000001) return null;

  const amount = ((b1.x - a1.x) * bDy - (b1.y - a1.y) * bDx) / denominator;
  return { x: a1.x + amount * aDx, y: a1.y + amount * aDy, z: a1.z };
}

function offsetSegment(start: CadPoint, end: CadPoint, side: number, offset: number) {
  const length = distance(start, end);
  if (length < 0.01) return null;
  const unit = { x: (end.x - start.x) / length, y: (end.y - start.y) / length, z: 0 };
  const normal = { x: -unit.y * side, y: unit.x * side, z: 0 };
  return {
    start: addScaled(start, normal, offset),
    end: addScaled(end, normal, offset),
    unit,
    normal,
    length,
  };
}

function roadBoundaryWithFillets(centerline: CadPoint[], offsetMeters: number) {
  const cleanCenterline = centerline.reduce<CadPoint[]>((acc, point) => {
    pushDistinct(acc, point, 0.05);
    return acc;
  }, []);
  if (cleanCenterline.length < 2) return [];

  const boundary: CadPoint[] = [];
  const radius = Math.abs(offsetMeters);
  const side = offsetMeters >= 0 ? 1 : -1;
  const arcStepRadians = Math.PI / 18;

  const segments = cleanCenterline
    .slice(0, -1)
    .map((point, index) => offsetSegment(point, cleanCenterline[index + 1], side, radius));
  const firstSegment = segments[0];
  if (!firstSegment) return [];
  pushDistinct(boundary, firstSegment.start);

  for (let index = 1; index < cleanCenterline.length - 1; index += 1) {
    const vertex = cleanCenterline[index];
    const previous = segments[index - 1];
    const next = segments[index];
    if (!previous || !next) continue;

    const turn = previous.unit.x * next.unit.y - previous.unit.y * next.unit.x;
    const dot = previous.unit.x * next.unit.x + previous.unit.y * next.unit.y;
    const turnAngle = Math.acos(Math.max(-1, Math.min(1, dot)));

    if (Math.abs(turn) < 0.02 || dot > 0.999) {
      pushDistinct(boundary, next.start);
      continue;
    }

    const outsideCorner = turn * side < 0;
    const miter = lineIntersection(previous.start, previous.end, next.start, next.end);
    const miterLimit = Math.min(Math.max(radius * 3.5, 10), Math.max(10, Math.min(previous.length, next.length) * 0.65));

    if (!outsideCorner && miter && distance(vertex, miter) <= miterLimit) {
      pushDistinct(boundary, miter);
      continue;
    }

    if (!outsideCorner) {
      pushDistinct(boundary, previous.end);
      pushDistinct(boundary, next.start);
      continue;
    }

    const canFilletJoin = turnAngle <= (110 * Math.PI) / 180 && previous.length >= radius * 2.25 && next.length >= radius * 2.25;
    if (!canFilletJoin) {
      pushDistinct(boundary, previous.end);
      pushDistinct(boundary, next.start);
      continue;
    }

    const startAngle = Math.atan2(previous.end.y - vertex.y, previous.end.x - vertex.x);
    const endAngle = Math.atan2(next.start.y - vertex.y, next.start.x - vertex.x);
    const delta = normalizeAngleDelta(endAngle - startAngle);
    const steps = Math.max(3, Math.ceil(Math.abs(delta) / arcStepRadians));

    for (let step = 0; step <= steps; step += 1) {
      const angle = startAngle + (delta * step) / steps;
      pushDistinct(boundary, { x: vertex.x + Math.cos(angle) * radius, y: vertex.y + Math.sin(angle) * radius, z: vertex.z });
    }
  }

  const lastSegment = segments[segments.length - 1];
  if (lastSegment) pushDistinct(boundary, lastSegment.end);
  return boundary;
}

export function classifyRoadHierarchy(
  properties: Record<string, string>,
  standards: RoadWidthStandard = defaultRoadWidthStandard,
): {
  category: RoadCategory;
  categoryLabel: string;
  totalWidth: number;
  halfWidth: number;
} {
  // 1. Explicit width or est_width tag in OSM
  const rawWidth = properties.width || properties.est_width || "";
  const matchWidth = rawWidth.match(/^([0-9]+(?:\.[0-9]+)?)\s*(?:m|meters)?$/i);
  if (matchWidth) {
    const parsed = Number(matchWidth[1]);
    if (Number.isFinite(parsed) && parsed >= 1.5 && parsed <= 50.0) {
      return {
        category: parsed >= 22 ? "national_highway" : parsed >= 11 ? "secondary_arterial" : parsed >= 7 ? "residential_street" : "barangay_road",
        categoryLabel: `Explicit Width (${parsed.toFixed(1)}m)`,
        totalWidth: parsed,
        halfWidth: parsed / 2,
      };
    }
  }

  // 2. Explicit lanes tag
  const rawLanes = Number(properties.lanes);
  const lanes = Number.isFinite(rawLanes) && rawLanes > 0 ? rawLanes : 0;

  // 3. Searchable name, ref, and highway tag
  const name = (properties.name || "").toLowerCase();
  const ref = (properties.ref || "").toLowerCase();
  const fullText = `${name} ${ref} ${properties.description || ""}`.toLowerCase();
  const highway = (properties.highway || "").toLowerCase();
  const oneway = ["yes", "1", "true"].includes((properties.oneway || "").toLowerCase());

  // A. Expressway / Motorway
  const isExpressway =
    ["motorway", "motorway_link"].includes(highway) ||
    hasAny(fullText, ["expressway", "slex", "nlex", "sctex", "tplex", "calax", "skyway", "tollway", "cllex", "cavitex", "nlex-slex"]);

  if (isExpressway) {
    let width = standards.motorwayWidth;
    if (oneway) width = width * 0.55;
    if (lanes >= 4) width = Math.max(width, lanes * 3.65 + 4.0);
    return {
      category: "motorway",
      categoryLabel: `Expressway (${width.toFixed(1)}m)`,
      totalWidth: width,
      halfWidth: width / 2,
    };
  }

  // B. National Highway / Primary Arterials
  const isNationalHwy =
    ["trunk", "trunk_link", "primary", "primary_link"].includes(highway) ||
    hasAny(fullText, [
      "national highway",
      "national hwy",
      "maharlika",
      "macarthur",
      "ah26",
      "pan-philippine",
      "diversion road",
      "diversion rd",
      "bypass road",
      "bypass rd",
      "boulevard",
      "blvd",
      "circumferential",
      "c-1", "c-2", "c-3", "c-4", "c-5", "c-6",
      "edsa",
      "radial road",
      "r-1", "r-2", "r-3", "r-4", "r-5", "r-6", "r-7", "r-8", "r-9", "r-10",
      "avenue",
      "ave",
      "arterial",
      "highway",
      "hwy",
    ]);

  if (isNationalHwy) {
    let width = standards.nationalHighwayWidth;
    if (oneway) width = width * 0.55;
    if (lanes >= 4) width = Math.max(width, lanes * 3.5 + 3.0);
    else if (lanes === 2) width = Math.max(14.0, width * 0.75);
    return {
      category: "national_highway",
      categoryLabel: `National Highway (${width.toFixed(1)}m)`,
      totalWidth: width,
      halfWidth: width / 2,
    };
  }

  // C. Secondary / Provincial Road
  const isSecondary =
    ["secondary", "secondary_link"].includes(highway) ||
    hasAny(fullText, ["provincial road", "provincial rd", "provincial highway", "municipal road", "governor", "major road"]);

  if (isSecondary) {
    let width = standards.secondaryWidth;
    if (oneway) width = width * 0.6;
    if (lanes >= 3) width = Math.max(width, lanes * 3.35 + 2.0);
    return {
      category: "secondary_arterial",
      categoryLabel: `Secondary / Provincial (${width.toFixed(1)}m)`,
      totalWidth: width,
      halfWidth: width / 2,
    };
  }

  // D. Tertiary / Municipal Collector
  const isTertiary =
    ["tertiary", "tertiary_link"].includes(highway) ||
    hasAny(fullText, ["collector", "poblacion", "town center", "plaza", "market road"]);

  if (isTertiary) {
    let width = standards.tertiaryWidth;
    if (oneway) width = width * 0.65;
    if (lanes >= 3) width = Math.max(width, lanes * 3.25 + 1.5);
    return {
      category: "tertiary_collector",
      categoryLabel: `Tertiary / Collector (${width.toFixed(1)}m)`,
      totalWidth: width,
      halfWidth: width / 2,
    };
  }

  // E. Interior Alley / Narrow Access / Footway
  const isAlley =
    ["service", "track", "pedestrian", "footway", "path", "alley", "steps", "corridor"].includes(highway) ||
    hasAny(fullText, ["alley", "callejon", "interior", "access road", "access rd", "pathway", "walkway", "footpath", "passage", "eskinita"]);

  if (isAlley) {
    const width = standards.alleyWidth;
    return {
      category: "interior_alley",
      categoryLabel: `Interior Alley / Access (${width.toFixed(1)}m)`,
      totalWidth: width,
      halfWidth: width / 2,
    };
  }

  // F. Barangay / Local Feeder Road
  const isBarangay =
    ["unclassified", "living_street"].includes(highway) ||
    hasAny(fullText, ["purok", "sitio", "barangay road", "brgy rd", "brgy road", "barangay rd", "feeder road", "farm to market", "fmr"]);

  if (isBarangay) {
    const width = standards.barangayWidth;
    return {
      category: "barangay_road",
      categoryLabel: `Barangay Road (${width.toFixed(1)}m)`,
      totalWidth: width,
      halfWidth: width / 2,
    };
  }

  // G. Default: Residential / Subdivision Street
  let width = standards.residentialWidth;
  if (lanes === 1) width = 4.0;
  else if (lanes >= 3) width = lanes * 3.25 + 1.5;

  return {
    category: "residential_street",
    categoryLabel: `Residential Street (${width.toFixed(1)}m)`,
    totalWidth: width,
    halfWidth: width / 2,
  };
}

export function highwayHalfWidth(
  properties: Record<string, string>,
  standards: RoadWidthStandard = defaultRoadWidthStandard,
): number {
  return classifyRoadHierarchy(properties, standards).halfWidth;
}

function buildCableRouteEntities(
  placemark: ClassifiedPlacemark,
  metricPoints: CadPoint[],
  outputPoints: CadPoint[],
  usesRawCoordinates: boolean,
  textStyle = "STANDARD",
  allowanceMeters = 2.0,
  telcoProvider: TelcoProvider = "globe",
  includeSpanMeasurements = true,
): { entities: string[]; points: CadPoint[] } {
  const entities: string[] = [];
  const points: CadPoint[] = [...outputPoints];

  const cableLayer: LayerName =
    placemark.layer === "SPAN"
      ? "SPAN"
      : telcoProvider === "pldt"
        ? "CABLE_ROUTES"
        : "P-AERIAL_FOC";

  // Draw the aerial cable line on P-AERIAL_FOC (Color 1 Red for Globe) or CABLE_ROUTES (Color 6 for PLDT)
  entities.push(entityPolyline(cableLayer, outputPoints, false));

  // Compute and place span measurement text for each segment on SPAN layer if enabled
  if (includeSpanMeasurements) {
    for (let i = 0; i < metricPoints.length - 1; i++) {
      const startMetric = metricPoints[i];
      const endMetric = metricPoints[i + 1];
      const length = distance(startMetric, endMetric);
      if (length < 0.8) continue;

      const startOut = outputPoints[i];
      const endOut = outputPoints[i + 1];

      const outLength = distance(startOut, endOut);
      if (outLength === 0) continue;

      const unit = { x: (endOut.x - startOut.x) / outLength, y: (endOut.y - startOut.y) / outLength, z: 0 };
      const normal = { x: -unit.y, y: unit.x, z: 0 };

      let rotation = (Math.atan2(unit.y, unit.x) * 180) / Math.PI;
      if (rotation > 90) rotation -= 180;
      else if (rotation < -90) rotation += 180;

      const midpoint = interpolate(startOut, endOut, 0.5);
      const textHeight = usesRawCoordinates ? 0.000015 : 1.4;
      const textOffset = usesRawCoordinates ? 0.000018 : 1.2;

      const labelPos = addScaled(midpoint, normal, textOffset);
      // User requested: 1 decimal place with +2m length allowance, based strictly on the surveyed aerial route
      const measuredSpan = (length + allowanceMeters).toFixed(1);
      const spanText = `${measuredSpan}m`;

      entities.push(
        entitySpanText(
          "SPAN",
          spanText,
          labelPos,
          textHeight,
          rotation,
          textStyle,
          7,
        ),
      );
    }
  }

  return { entities, points };
}

function buildPoleSpansEntities(
  polePointsMetric: CadPoint[],
  polePointsOutput: CadPoint[],
  usesRawCoordinates: boolean,
  textStyle = "STANDARD",
  allowanceMeters = 2.0,
  maxSpanMeters = 120.0,
  telcoProvider: TelcoProvider = "globe",
  includeSpanMeasurements = true,
): { entities: string[]; points: CadPoint[] } {
  const entities: string[] = [];
  const points: CadPoint[] = [];
  const cableLayer: LayerName = telcoProvider === "pldt" ? "CABLE_ROUTES" : "P-AERIAL_FOC";

  for (let i = 0; i < polePointsMetric.length - 1; i++) {
    const startMetric = polePointsMetric[i];
    const endMetric = polePointsMetric[i + 1];
    const length = distance(startMetric, endMetric);
    if (length < 2.0 || length > maxSpanMeters) continue;

    const startOut = polePointsOutput[i];
    const endOut = polePointsOutput[i + 1];

    const outLength = distance(startOut, endOut);
    if (outLength === 0) continue;

    // Aerial cable route line between consecutive surveyed poles
    entities.push(entityPolyline(cableLayer, [startOut, endOut], false));
    points.push(startOut, endOut);

    if (includeSpanMeasurements) {
      const unit = { x: (endOut.x - startOut.x) / outLength, y: (endOut.y - startOut.y) / outLength, z: 0 };
      const normal = { x: -unit.y, y: unit.x, z: 0 };

      let rotation = (Math.atan2(unit.y, unit.x) * 180) / Math.PI;
      if (rotation > 90) rotation -= 180;
      else if (rotation < -90) rotation += 180;

      const midpoint = interpolate(startOut, endOut, 0.5);
      const textHeight = usesRawCoordinates ? 0.000015 : 1.4;
      const textOffset = usesRawCoordinates ? 0.000018 : 1.2;

      const labelPos = addScaled(midpoint, normal, textOffset);
      const measuredSpan = (length + allowanceMeters).toFixed(1);
      const spanText = `${measuredSpan}m`;

      entities.push(
        entitySpanText(
          "SPAN",
          spanText,
          labelPos,
          textHeight,
          rotation,
          textStyle,
          7,
        ),
      );
    }
  }

  return { entities, points };
}

function normalizeRoadDisplayName(rawName: string): { name: string; generic: boolean } {
  const trimmed = (rawName || "").trim();
  if (
    !trimmed ||
    /^ROAD$/i.test(trimmed) ||
    /^BRGY\.?\s*ROAD$/i.test(trimmed) ||
    /^BARANGAY\s+ROAD$/i.test(trimmed) ||
    /^UNNAMED(?:\s+ROAD)?$/i.test(trimmed) ||
    /^OSM\s+\S+\s+\d+/i.test(trimmed)
  ) {
    return { name: "BRGY ROAD", generic: true };
  }
  return { name: trimmed.toUpperCase(), generic: false };
}

function normalizeReadableTextRotation(rotationDegrees: number): { rotation: number; flipped: boolean } {
  let rot = ((rotationDegrees + 180) % 360 + 360) % 360 - 180;
  let flipped = false;
  if (rot > 90) {
    rot -= 180;
    flipped = true;
  } else if (rot <= -90) {
    rot += 180;
    flipped = true;
  }
  return { rotation: rot, flipped };
}

function buildRoadNetworkEntities(
  roads: ClassifiedPlacemark[],
  projectMetric: (point: LonLat) => CadPoint,
  geofence: PoleGeofence | null,
  outputPoint: (point: CadPoint) => CadPoint = (point) => point,
  usesRawCoordinates = false,
  roadWidthStandard: RoadWidthStandard = defaultRoadWidthStandard,
  telcoProvider: TelcoProvider = "globe",
  textStyle = "STANDARD",
) {
  const inputs: RoadChainInput[] = [];

  roads.forEach((road) => {
    if (road.geometry.type !== "LineString" || road.geometry.coordinates.length < 2) return;
    const points = road.geometry.coordinates.map(projectMetric);
    const roadInfo = classifyRoadHierarchy(road.properties, roadWidthStandard);
    const { name, generic } = normalizeRoadDisplayName(road.name);

    let currentRun: CadPoint[] = [];
    let runIndex = 0;
    const flushRun = () => {
      if (currentRun.length >= 2) {
        runIndex += 1;
        inputs.push({
          id: `${road.id}-${runIndex}`,
          points: currentRun,
          name,
          generic,
          category: roadInfo.category,
          halfWidth: roadInfo.halfWidth,
        });
      }
      currentRun = [];
    };

    for (let i = 0; i < points.length - 1; i += 1) {
      const start = points[i];
      const end = points[i + 1];
      if (distance(start, end) < 0.05) continue;
      if (geofence && !segmentInsideGeofence(start, end, geofence)) {
        flushRun();
        continue;
      }
      if (!currentRun.length) currentRun.push(start);
      currentRun.push(end);
    }
    flushRun();
  });

  if (!inputs.length) return { entities: [] as string[], points: [] as CadPoint[], boundaries: [] as CadPoint[][], curbPieces: [] as RoadCurbPiece[], labelBoxes: [] as RoadLabelBoxInput[] };

  const network = buildRoadNetwork(inputs);
  const entities: string[] = [];
  const generatedPoints: CadPoint[] = [];
  const labelBoxes: RoadLabelBoxInput[] = [];
  const roadLabelColor = isPldtProvider(telcoProvider) ? 5 : 2;

  network.boundaries.forEach((piece) => {
    const outPiece = piece.map(outputPoint);
    if (outPiece.length < 2) return;
    entities.push(entityPolyline("ROAD_BOUNDARIES", outPiece, false));
    generatedPoints.push(...outPiece);
  });

  network.labels.forEach((label) => {
    const pA = outputPoint(label.anchor);
    const pB = outputPoint({
      x: label.anchor.x + label.dir.x * 10,
      y: label.anchor.y + label.dir.y * 10,
      z: label.anchor.z,
    });
    const outSpan = distance(pA, pB) || 1;
    const rawRotation = (Math.atan2(pB.y - pA.y, pB.x - pA.x) * 180) / Math.PI;
    const { rotation } = normalizeReadableTextRotation(rawRotation);

    const textHeight = usesRawCoordinates ? 1.5 * (outSpan / 10) : 1.5;
    const labelPoint = {
      x: pA.x,
      y: pA.y,
      z: pA.z,
    };
    const labelBoxWidth = Math.max(textHeight * Math.max(label.text.length, 10) * 1.1, textHeight * 12);
    const metricLabelW = Math.max(1.5 * Math.max(label.text.length, 6) * 0.85, 9.0);
    labelBoxes.push({
      center: label.anchor,
      angleDeg: rotation,
      width: metricLabelW + 2.4,
      height: 1.5 * 1.3 + 1.6,
    });

    entities.push(
      entityText(
        "ROAD_LABELS",
        label.text,
        labelPoint,
        textHeight,
        rotation,
        5,
        labelBoxWidth,
        roadLabelColor,
        textStyle,
      ),
    );
    generatedPoints.push(labelPoint);
  });

  return { entities, points: generatedPoints, boundaries: network.boundaries, curbPieces: network.curbPieces, labelBoxes };
}

export function hasRawProposedNapAttribute(placemark: Placemark): boolean {
  const val = cleanFieldValue(
    findProperty(placemark.properties, [
      "proposed nap",
      "proposed_nap",
      "proposednap",
      "prop nap",
      "prop_nap",
      "nap proposed",
      "nap_proposed",
    ]),
  );
  if (/^(?:yes|y|true|1|8|16)$/i.test(val)) return true;
  if (val && !/^(?:no|n|false|0|none|n\/a|na|-)$/i.test(val) && /\b(?:yes|nap|8|16|lcp)\b/i.test(val)) return true;

  const remarks = cleanFieldValue(findProperty(placemark.properties, ["remarks", "remark"]));
  if (/\bfoc\s*\+\s*nap\b|\bwith\s+nap\b|\bproposed\s+nap\s*[:=]\s*yes\b/i.test(remarks)) return true;

  return false;
}

export function isExplicitDummyNapPole(placemark: Placemark): boolean {
  const val = cleanFieldValue(
    findProperty(placemark.properties, [
      "proposed nap",
      "proposed_nap",
      "proposednap",
      "prop nap",
      "prop_nap",
      "nap proposed",
      "nap_proposed",
      "nap",
      "nap type",
      "nap_type",
      "remarks",
      "remark",
    ]),
  );
  if (/\bdummy\b/i.test(val) || /\bdummy\s*nap\b/i.test(placemark.name || "")) return true;
  return false;
}

export function hasProposedNapAttribute(placemark: Placemark): boolean {
  if (placemark.properties._excludePropNap === "true") return false;
  if (placemark.properties._excludePropNap === "false") return true;
  if (isExplicitDummyNapPole(placemark)) return false;
  return hasRawProposedNapAttribute(placemark);
}

export function resolvePoleProposedNapLines(
  pole: Placemark,
  allPlacemarks: ClassifiedPlacemark[],
  projectMetric: (point: LonLat) => CadPoint,
): 8 | 16 {
  if (pole.properties._napLines === "16") return 16;
  if (pole.properties._napLines === "8") return 8;

  const directFields = [
    findProperty(pole.properties, [
      "nap lines",
      "nap_lines",
      "nap capacity",
      "nap_capacity",
      "nap ports",
      "nap_ports",
      "splitter",
      "ports",
      "lines",
      "nap type",
      "nap_type",
      "proposed nap",
      "proposed_nap",
      "nap",
      "nap id",
      "nap_id",
      "nap name",
      "nap_name",
      "remarks",
      "remark",
    ]),
    pole.name,
    pole.description,
    ...Object.values(pole.properties),
  ]
    .filter(Boolean)
    .join(" ");

  const hasExplicit8 =
    /(?:^|[_\-\s])8[_\-\s]*(?:lines?|ports?|p)(?:[_\-\s]|$)/i.test(directFields) ||
    /(?:^|[_\-\s])(?:1|2)[:\/x]8(?:[_\-\s]|$)/i.test(directFields);
  const hasExplicit16 =
    /(?:^|[_\-\s])16[_\-\s]*(?:lines?|ports?|p)(?:[_\-\s]|$)/i.test(directFields) ||
    /(?:^|[_\-\s])(?:1|2)[:\/x]16(?:[_\-\s]|$)/i.test(directFields);

  if (hasExplicit8 && !hasExplicit16) return 8;
  if (hasExplicit16 && !hasExplicit8) return 16;
  if (/\bnon[_\-\s]*lcp\b/i.test(directFields)) return 8;
  if (/\blcp\b/i.test(directFields)) return 16;
  if (/(?:^|[_\-\s])(?:N|NAP)[_\-\s]*0?[2-9](?:[_\-\s]|$)/i.test(directFields)) return 8;
  if (/(?:^|[_\-\s])(?:N|NAP)[_\-\s]*0?1(?:[_\-\s]|$)/i.test(directFields)) return 16;

  // Check if a separate NAP placemark is located near this pole (within 28m)
  if (pole.geometry.type === "Point") {
    const polePt = projectMetric(pole.geometry.coordinates);
    for (const candidate of allPlacemarks) {
      if (candidate.id === pole.id || candidate.geometry.type !== "Point") continue;
      const candPt = projectMetric(candidate.geometry.coordinates);
      if (distance(polePt, candPt) > 28) continue;
      const candText = [
        candidate.name,
        candidate.description,
        candidate.layer,
        ...Object.values(candidate.properties),
      ]
        .filter(Boolean)
        .join(" ");
      if (!/\b(?:nap|n0?\d|lcp|1[:\/x](?:8|16))\b/i.test(candText)) continue;
      if (
        /(\b|_)(16[\s\-_]*(?:lines?|ports?|p)|1[:\/x]16|2[:\/x]16)(\b|_)/i.test(candText) ||
        /(?:^|[_\-\s])(?:N|NAP)[_\-\s]*0?1(?:[_\-\s]|$)/i.test(candText) ||
        /\b(?<!non[\s\-_]*)lcp\b/i.test(candText)
      ) {
        return 16;
      }
      if (
        /(\b|_)(8[\s\-_]*(?:lines?|ports?|p)|1[:\/x]8|2[:\/x]8|non[\s\-_]*lcp)(\b|_)/i.test(candText) ||
        /(?:^|[_\-\s])(?:N|NAP)[_\-\s]*0?[2-9](?:[_\-\s]|$)/i.test(candText)
      ) {
        return 8;
      }
    }
  }

  return 8;
}

function polylineCumulativeLengths(pts: CadPoint[]): number[] {
  const cum: number[] = [0];
  for (let i = 1; i < pts.length; i += 1) {
    cum.push(cum[i - 1] + distance(pts[i - 1], pts[i]));
  }
  return cum;
}

function samplePolylineAtArcLength(
  pts: CadPoint[],
  cum: number[],
  s: number,
): { point: CadPoint; tangent: CadPoint } {
  const total = cum[cum.length - 1] || 0;
  if (pts.length === 0) return { point: { x: 0, y: 0, z: 0 }, tangent: { x: 1, y: 0, z: 0 } };
  if (pts.length === 1 || total <= 1e-6) {
    return { point: { ...pts[0], z: 0 }, tangent: { x: 1, y: 0, z: 0 } };
  }
  const clamped = Math.max(0, Math.min(total, s));
  for (let i = 0; i < pts.length - 1; i += 1) {
    const s0 = cum[i];
    const s1 = cum[i + 1];
    const segLen = s1 - s0;
    if (segLen <= 1e-6) continue;
    if (clamped <= s1 || i === pts.length - 2) {
      const t = Math.max(0, Math.min(1, (clamped - s0) / segLen));
      return {
        point: interpolate(pts[i], pts[i + 1], t),
        tangent: {
          x: (pts[i + 1].x - pts[i].x) / segLen,
          y: (pts[i + 1].y - pts[i].y) / segLen,
          z: 0,
        },
      };
    }
  }
  const last = pts[pts.length - 1];
  const prev = pts[pts.length - 2];
  const len = distance(prev, last) || 1;
  return {
    point: { ...last, z: 0 },
    tangent: { x: (last.x - prev.x) / len, y: (last.y - prev.y) / len, z: 0 },
  };
}

function extractPolylineSubchain(pts: CadPoint[], cum: number[], sStart: number, sEnd: number): CadPoint[] {
  const total = cum[cum.length - 1] || 0;
  const a = Math.max(0, Math.min(total, Math.min(sStart, sEnd)));
  const b = Math.max(0, Math.min(total, Math.max(sStart, sEnd)));
  if (b - a <= 1e-3) {
    const p = samplePolylineAtArcLength(pts, cum, a).point;
    return [p, { x: p.x + 1, y: p.y, z: 0 }];
  }
  const out: CadPoint[] = [samplePolylineAtArcLength(pts, cum, a).point];
  for (let i = 1; i < pts.length - 1; i += 1) {
    if (cum[i] > a + 0.05 && cum[i] < b - 0.05) {
      out.push({ x: pts[i].x, y: pts[i].y, z: 0 });
    }
  }
  out.push(samplePolylineAtArcLength(pts, cum, b).point);
  return out;
}

function samplePolylineAtFraction(pts: CadPoint[], frac: number): { point: CadPoint; tangent: CadPoint } {
  const cum = polylineCumulativeLengths(pts);
  const total = cum[cum.length - 1] || 0;
  return samplePolylineAtArcLength(pts, cum, Math.max(0, Math.min(1, frac)) * total);
}

function segmentsProperlyCross(a1: CadPoint, a2: CadPoint, b1: CadPoint, b2: CadPoint): boolean {
  const d1x = a2.x - a1.x;
  const d1y = a2.y - a1.y;
  const d2x = b2.x - b1.x;
  const d2y = b2.y - b1.y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-7) return false;
  const ox = b1.x - a1.x;
  const oy = b1.y - a1.y;
  const t = (ox * d2y - oy * d2x) / denom;
  const u = (ox * d1y - oy * d1x) / denom;
  return t > 0.02 && t < 0.98 && u > 0.02 && u < 0.98;
}

function pointInPolygon(pt: CadPoint, ring: CadPoint[]): boolean {
  if (ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].x;
    const yi = ring[i].y;
    const xj = ring[j].x;
    const yj = ring[j].y;
    const intersect = yi > pt.y !== yj > pt.y && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi || 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function isPointInsideAnyRoadCarriageway(pt: CadPoint, curbPieces: RoadCurbPiece[]): boolean {
  for (const curb of curbPieces) {
    const pts = curb.points;
    const roadWidth = Math.max(curb.halfWidth * 2, 4.0);
    for (let i = 0; i < pts.length - 1; i += 1) {
      const a = pts[i];
      const b = pts[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lenSq = dx * dx + dy * dy;
      if (lenSq < 0.25) continue;
      const t = ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / lenSq;
      if (t < -0.02 || t > 1.02) continue;
      const projX = a.x + t * dx;
      const projY = a.y + t * dy;
      const distSq = (pt.x - projX) ** 2 + (pt.y - projY) ** 2;
      if (distSq > roadWidth * roadWidth) continue;
      const len = Math.sqrt(lenSq);
      // Left normal of A -> B is (-dy/len, dx/len).
      // Outward away from road is curb.side * leftNormal; inward into road is -curb.side * leftNormal.
      const inNx = -curb.side * (-dy / len);
      const inNy = -curb.side * (dx / len);
      const inwardDist = (pt.x - projX) * inNx + (pt.y - projY) * inNy;
      if (inwardDist > 0.35 && inwardDist < roadWidth - 0.35) {
        return true;
      }
    }
  }
  return false;
}

export type HldProposedNapItem = {
  id: string;
  name: string;
  coordinates: LonLat;
  napLines: 8 | 16;
};

export function resolveHldProposedNapLines(
  placemark: Placemark | { name?: string; description?: string; properties?: Record<string, string> }
): 8 | 16 {
  const name = placemark.name || "";
  const props = placemark.properties || {};
  const folder = props.Folder || props._folder || "";
  const folderChain = props._folderChain || folder;
  const desc = placemark.description || "";
  const propValues = Object.values(props).join(" ");
  const fullText = `${name} ${folder} ${folderChain} ${desc} ${propValues}`;

  // 1. Direct explicit property
  if (props._napLines === "8") return 8;
  if (props._napLines === "16") return 16;

  // 2. Explicit 8 or 16 in Placemark Name (highest priority for HLD placemark naming, e.g. MINXXX_L9XX_NXX_8_LINES or 16 LINES)
  const hasExplicit8InName =
    /(?:^|[_\-\s])8[_\-\s]*(?:lines?|ports?|p)(?:[_\-\s]|$)/i.test(name) ||
    /(?:^|[_\-\s])(?:1|2)[:\/x]8(?:[_\-\s]|$)/i.test(name);
  const hasExplicit16InName =
    /(?:^|[_\-\s])16[_\-\s]*(?:lines?|ports?|p)(?:[_\-\s]|$)/i.test(name) ||
    /(?:^|[_\-\s])(?:1|2)[:\/x]16(?:[_\-\s]|$)/i.test(name);

  if (hasExplicit8InName && !hasExplicit16InName) return 8;
  if (hasExplicit16InName && !hasExplicit8InName) return 16;

  // 3. Explicit 8 or 16 in properties or description or folder chain
  const hasExplicit8InText =
    /(?:^|[_\-\s])8[_\-\s]*(?:lines?|ports?|p)(?:[_\-\s]|$)/i.test(fullText) ||
    /(?:^|[_\-\s])(?:1|2)[:\/x]8(?:[_\-\s]|$)/i.test(fullText);
  const hasExplicit16InText =
    /(?:^|[_\-\s])16[_\-\s]*(?:lines?|ports?|p)(?:[_\-\s]|$)/i.test(fullText) ||
    /(?:^|[_\-\s])(?:1|2)[:\/x]16(?:[_\-\s]|$)/i.test(fullText);

  if (hasExplicit8InText && !hasExplicit16InText) return 8;
  if (hasExplicit16InText && !hasExplicit8InText) return 16;

  // 4. LCP heuristics (non-lcp is 8 lines, lcp is 16 lines)
  if (/\bnon[_\-\s]*lcp\b/i.test(fullText)) return 8;
  if (/\blcp\b/i.test(fullText)) return 16;

  // 5. Fallback naming convention: N02, N03... are 8 lines; N01 is 16 lines ONLY if no other line count specified
  if (/(?:^|[_\-\s]|L\d+)(?:N|NAP)[_\-\s]*0?([2-9]|\d{2,})(?:[_\-\s]|$)/i.test(name)) return 8;
  if (/(?:^|[_\-\s]|L\d+)(?:N|NAP)[_\-\s]*0?1(?:[_\-\s]|$)/i.test(name)) return 16;

  return 8;
}

export function isOdnEquipmentOrNapPoint(p: Placemark): boolean {
  if (p.geometry.type !== "Point") return false;
  const rawName = (p.name || "").trim();
  const folder = (p.properties?.Folder || p.properties?._folder || "").trim();
  const folderChain = (p.properties?._folderChain || folder).trim();
  if (/\bpoles?\b/i.test(folderChain) && looksLikeMapsMePoleName(rawName)) {
    return false;
  }
  if (isStandardNapIdentifier(rawName) || isNapEntity(rawName, folderChain)) return true;
  if (/^(?:xbox|hub\s*box|hubbox|closure|proposed\s+\d+\s*f\s+closure|olt|odf)\b/i.test(rawName)) return true;
  if (/\b(?:xbox|hubbox|hub\s*box)\b/i.test(rawName) && !/^p(?:rop)?[-_\s]*[79]\b/i.test(rawName)) return true;
  if (/^[A-Z]{3}\d{1,4}$/i.test(rawName) && !/\bpoles?\b/i.test(folderChain)) return true;
  return false;
}

export function filterPoleSurveyPlacemarks(parsed: Placemark[]): Placemark[] {
  const hasDedicatedPolesFolder = parsed.some(
    (p) => p.geometry.type === "Point" && /\bpoles?\b/i.test(p.properties?._folderChain || p.properties?.Folder || ""),
  );
  const isMapsMeFile = parsed.some((p) => p.properties?._mwm === "true");

  return parsed.filter((p) => {
    if (p.geometry.type === "Point") {
      if (isOdnEquipmentOrNapPoint(p)) return false;
      if (hasDedicatedPolesFolder) {
        const fc = p.properties?._folderChain || p.properties?.Folder || "";
        if (!/\bpoles?\b/i.test(fc) && !looksLikeMapsMePoleName(p.name || "")) {
          return false;
        }
      }
      return true;
    }
    if (p.geometry.type === "LineString" && (hasDedicatedPolesFolder || isMapsMeFile)) {
      const fc = p.properties?._folderChain || p.properties?.Folder || "";
      const rawName = (p.name || "").trim();
      const isSchematicHldLine =
        (!/\bpoles?\b/i.test(fc) && hasDedicatedPolesFolder) ||
        /^(?:\d+\s*f|\d*\s*c|untitled\s*path)$/i.test(rawName);
      if (isSchematicHldLine) {
        return false;
      }
    }
    return true;
  });
}

export function extractHldProposedNapsFromPlacemarks(placemarks: Placemark[]): HldProposedNapItem[] {
  const result: HldProposedNapItem[] = [];
  placemarks.forEach((p, idx) => {
    if (p.geometry.type !== "Point") return;
    const folder = p.properties.Folder || p.properties._folder || "";
    const folderChain = p.properties._folderChain || folder;
    const searchable = `${p.name} ${folder} ${folderChain} ${p.description || ""} ${Object.values(p.properties).join(" ")}`;

    if (/\bolt\b|\bpoi\b/i.test(searchable) && !isNapEntity(p.name, folder)) return;

    const underProposedFolder = isProposedNapFolder(folder) || isProposedNapFolder(folderChain);

    if (underProposedFolder || isProposedNapFolder(searchable)) {
      const status = detectNapStatus(searchable, folder);
      const isDummy = isDummyNapIdentifier(p.name, folder) || status === "DUMMY";
      const isExisting = hasExistingNapIdentifier(searchable) || status === "EXISTING";
      if (!isDummy && !isExisting) {
        result.push({
          id: p.id || `hld-nap-${idx}`,
          name: p.name || `Proposed NAP ${idx + 1}`,
          coordinates: p.geometry.coordinates,
          napLines: resolveHldProposedNapLines(p),
        });
      }
    }
  });

  // Strictly filter for items residing under a PROPOSED NAP folder if present
  const strictlyUnderFolder = result.filter((item) => {
    const orig = placemarks.find((p) => p.id === item.id);
    if (!orig) return false;
    const f = orig.properties.Folder || orig.properties._folder || "";
    const fc = orig.properties._folderChain || f;
    return isProposedNapFolder(f) || isProposedNapFolder(fc);
  });

  if (strictlyUnderFolder.length > 0) return strictlyUnderFolder;
  if (result.length > 0) return result;

  // Fallback for combined ODN / Maps.me KMZ files where Proposed NAP pins (e.g. MIN71_L901N67) are at root level
  const surveyPolePoints = placemarks.filter((p): p is Placemark & { geometry: { type: "Point"; coordinates: LonLat } } => {
    if (p.geometry.type !== "Point") return false;
    const fc = p.properties.Folder || p.properties._folderChain || p.properties._folder || "";
    return /\bpoles?\b/i.test(fc) || (!isStandardNapIdentifier(p.name) && looksLikeMapsMePoleName(p.name));
  });

  const fallbackNaps: HldProposedNapItem[] = [];
  placemarks.forEach((p, idx) => {
    if (p.geometry.type !== "Point") return;
    const rawName = (p.name || "").trim();
    const folder = p.properties.Folder || p.properties._folder || "";
    const folderChain = p.properties._folderChain || folder;
    if (/\bpoles?\b/i.test(folderChain)) return;
    if (!isStandardNapIdentifier(rawName)) return;

    const searchable = `${rawName} ${folder} ${folderChain} ${p.description || ""}`;
    const status = detectNapStatus(searchable, folder);
    const isDummy = isDummyNapIdentifier(rawName, folder) || status === "DUMMY";
    const isExisting = hasExistingNapIdentifier(searchable) || status === "EXISTING";
    if (isDummy || isExisting) return;

    if (surveyPolePoints.length > 0) {
      const napMerc = lonLatToWgs84Mercator(p.geometry.coordinates);
      const nearSurveyPole = surveyPolePoints.some((pole) => {
        const poleMerc = lonLatToWgs84Mercator(pole.geometry.coordinates);
        return Math.hypot(napMerc.x - poleMerc.x, napMerc.y - poleMerc.y) <= 150;
      });
      if (!nearSurveyPole) return;
    }

    fallbackNaps.push({
      id: p.id || `hld-nap-fallback-${idx}`,
      name: rawName || `Proposed NAP ${idx + 1}`,
      coordinates: p.geometry.coordinates,
      napLines: resolveHldProposedNapLines(p),
    });
  });

  return fallbackNaps;
}

function buildProposedNapResLotBoxesEntities(
  placemarks: ClassifiedPlacemark[],
  roadBoundariesMetric: CadPoint[][],
  roadCurbPieces: RoadCurbPiece[],
  projectMetric: (point: LonLat) => CadPoint,
  outputPoint: (point: CadPoint) => CadPoint = (point) => point,
  usesRawCoordinates = false,
  textStyle = "STANDARD",
  hldProposedNaps?: HldProposedNapItem[],
): { entities: string[]; points: CadPoint[] } {
  type NapTarget = {
    id: string;
    name: string;
    coordinates: LonLat;
    napLines: 8 | 16;
  };

  let napTargets: NapTarget[] = [];

  if (hldProposedNaps && hldProposedNaps.length > 0) {
    // Sourced strictly from HLD PROPOSED NAP folder (Source of Truth) — pole attributes are completely bypassed
    napTargets = hldProposedNaps.map((n) => ({
      id: n.id,
      name: n.name,
      coordinates: n.coordinates,
      napLines: n.napLines,
    }));
  }

  if (!napTargets.length) return { entities: [], points: [] };

  const allPolesMetric = placemarks
    .filter((p) => p.geometry.type === "Point")
    .map((p) => ({
      id: p.id,
      pt: projectMetric((p.geometry as Extract<Geometry, { type: "Point" }>).coordinates),
    }));

  const cableSegmentsMetric: Array<{ a: CadPoint; b: CadPoint }> = [];
  placemarks.forEach((p) => {
    if (
      p.geometry.type === "LineString" &&
      (p.layer === "CABLE_ROUTES" || p.layer === "SPAN" || p.layer === "SOURCE_LINES" || p.layer === "FEEDER_CABLES")
    ) {
      const coords = p.geometry.coordinates.map(projectMetric);
      for (let i = 0; i < coords.length - 1; i += 1) {
        if (distance(coords[i], coords[i + 1]) >= 1.0) {
          cableSegmentsMetric.push({ a: coords[i], b: coords[i + 1] });
        }
      }
    }
  });
  if (!cableSegmentsMetric.length && allPolesMetric.length >= 2) {
    const ordered = orderedPolePath(allPolesMetric.map((item) => item.pt));
    for (let i = 0; i < ordered.length - 1; i += 1) {
      if (distance(ordered[i], ordered[i + 1]) >= 1.0) {
        cableSegmentsMetric.push({ a: ordered[i], b: ordered[i + 1] });
      }
    }
  }

  const effectiveCurbPieces: RoadCurbPiece[] =
    roadCurbPieces.length > 0
      ? roadCurbPieces
      : roadBoundariesMetric.map((pts) => ({
          points: pts.map((p) => ({ x: p.x, y: p.y, z: p.z ?? 0 })),
          side: 1 as const,
          halfWidth: 4.0,
        }));

  const entities: string[] = [];
  const generatedPoints: CadPoint[] = [];
  const napInset = 0.8;

  type PlacedNapCluster = {
    polygon: CadPoint[];
    edges: Array<{ a: CadPoint; b: CadPoint }>;
    samplePoints: CadPoint[];
  };
  const placedClusters: PlacedNapCluster[] = [];

  // Place 16-Line NAPs FIRST so that 8-Line NAPs (which are shorter and have more room to slide/adjust)
  // automatically adjust their position along the road curb to avoid overlapping 16-Line NAPs.
  const orderedNapTargets = napTargets
    .map((target, origIdx) => ({
      target,
      origIdx,
      napLines: target.napLines,
    }))
    .sort((a, b) => {
      if (a.napLines !== b.napLines) return b.napLines - a.napLines; // 16-lines before 8-lines
      return a.origIdx - b.origIdx;
    });

  const shifts: number[] = [0];
  for (let s = 8; s <= 104; s += 8) {
    shifts.push(-s, s);
  }
  const sizeScales: Array<{ fScale: number; dScale: number }> = [
    { fScale: 1.0, dScale: 1.0 },
    { fScale: 0.86, dScale: 0.92 },
    { fScale: 0.74, dScale: 0.84 },
  ];

  orderedNapTargets.forEach(({ target, origIdx: napIdx, napLines }) => {
    const polePt = projectMetric(target.coordinates);
    const cols = napLines === 16 ? 8 : 5;
    const rows = 2;

    // Uniform lot box sizes WITHIN each NAP (while allowing slight overall variation between different NAPs)
    const seed = Math.abs(Math.round(polePt.x * 0.37 + polePt.y * 0.73)) + napIdx;
    const colWidth = (cols === 8 ? 14.5 : 18.2) + ((seed % 3) - 1) * 0.6;
    const baseDesiredFrontage = cols * colWidth;
    const baseRowDepth = (cols === 8 ? 15.6 : 18.2) + ((seed % 3) - 1) * 0.5;

    // Evaluate candidate curb placements near the pole so the lot grid sticks directly to the road side,
    // never covers any road carriageway, and never overlaps any already-placed NAP lot cluster.
    type PlacementCandidate = {
      frontChain: CadPoint[];
      midChain: CadPoint[];
      backChain: CadPoint[];
      outwardSign: 1 | -1;
      actualFrontage: number;
      row1Depth: number;
      totalDepth: number;
      score: number;
    };

    let bestCandidate: PlacementCandidate | null = null;

    effectiveCurbPieces.forEach((curb) => {
      const curbPts: CadPoint[] = curb.points.map((p) => ({ x: p.x, y: p.y, z: 0 }));
      if (curbPts.length < 2) return;
      const cum = polylineCumulativeLengths(curbPts);
      const chainLen = cum[cum.length - 1] || 0;
      const minFrontage = cols * 6.5;
      if (chainLen < minFrontage) return;

      // Project pole onto this curb polyline
      let bestDist = Infinity;
      let bestS = 0;
      let bestSegIdx = 0;
      for (let i = 0; i < curbPts.length - 1; i += 1) {
        const a = curbPts[i];
        const b = curbPts[i + 1];
        const segLenSq = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
        if (segLenSq < 0.25) continue;
        const t = Math.max(0, Math.min(1, ((polePt.x - a.x) * (b.x - a.x) + (polePt.y - a.y) * (b.y - a.y)) / segLenSq));
        const proj = interpolate(a, b, t);
        const d = distance(polePt, proj);
        if (d < bestDist) {
          bestDist = d;
          bestS = cum[i] + t * Math.sqrt(segLenSq);
          bestSegIdx = i;
        }
      }

      if (bestDist > 55) return;

      // Determine if pole is on the same side of the road centerline as this curb
      const segA = curbPts[bestSegIdx];
      const segB = curbPts[bestSegIdx + 1];
      const segLen = distance(segA, segB) || 1;
      const outNx = curb.side * (-(segB.y - segA.y) / segLen);
      const outNy = curb.side * ((segB.x - segA.x) / segLen);
      const projPt = samplePolylineAtArcLength(curbPts, cum, bestS).point;
      const roadCenterX = projPt.x - outNx * curb.halfWidth;
      const roadCenterY = projPt.y - outNy * curb.halfWidth;
      const poleSideDot = (polePt.x - roadCenterX) * outNx + (polePt.y - roadCenterY) * outNy;
      const wrongSidePenalty = poleSideDot < -0.5 ? 65 : 0;

      for (const { fScale, dScale } of sizeScales) {
        const desiredFrontage = baseDesiredFrontage * fScale;
        const row1Depth = baseRowDepth * dScale;
        const totalDepth = row1Depth * 2;
        const actualFrontage = Math.min(desiredFrontage, chainLen);
        if (actualFrontage < minFrontage * 0.98) continue;

        for (const shift of shifts) {
          let sStart = bestS + shift - actualFrontage / 2;
          let sEnd = sStart + actualFrontage;
          if (sStart < 0) {
            sStart = 0;
            sEnd = Math.min(chainLen, actualFrontage);
          }
          if (sEnd > chainLen) {
            sEnd = chainLen;
            sStart = Math.max(0, chainLen - actualFrontage);
          }
          if (sEnd - sStart < minFrontage * 0.98) continue;

          const frontChain = extractPolylineSubchain(curbPts, cum, sStart, sEnd);
          if (frontChain.length < 2) continue;

          const midChain = offsetEdge(frontChain, curb.side * row1Depth).map((p) => ({ x: p.x, y: p.y, z: 0 }));
          const backChain = offsetEdge(frontChain, curb.side * totalDepth).map((p) => ({ x: p.x, y: p.y, z: 0 }));
          if (midChain.length < 2 || backChain.length < 2) continue;

          // 1. Check road carriageway collisions
          let collisionCount = 0;
          const sampleFracs = [0.02, 0.16, 0.32, 0.5, 0.68, 0.84, 0.98];
          const candSamplePoints: CadPoint[] = [];
          const candEdges: Array<{ a: CadPoint; b: CadPoint }> = [];

          for (let i = 0; i < frontChain.length - 1; i += 1) {
            candEdges.push({ a: frontChain[i], b: frontChain[i + 1] });
          }
          for (let i = 0; i < backChain.length - 1; i += 1) {
            candEdges.push({ a: backChain[i], b: backChain[i + 1] });
          }

          for (const f of sampleFracs) {
            const pf = samplePolylineAtFraction(frontChain, f).point;
            const pm = samplePolylineAtFraction(midChain, f).point;
            const pb = samplePolylineAtFraction(backChain, f).point;
            const row1Mid = interpolate(pf, pm, 0.5);
            const row2Mid = interpolate(pm, pb, 0.5);
            candSamplePoints.push(pf, pm, pb, row1Mid, row2Mid);
            candEdges.push({ a: pf, b: pb });

            if (isPointInsideAnyRoadCarriageway(row1Mid, effectiveCurbPieces)) collisionCount += 2;
            if (isPointInsideAnyRoadCarriageway(row2Mid, effectiveCurbPieces)) collisionCount += 2;
            if (isPointInsideAnyRoadCarriageway(pm, effectiveCurbPieces)) collisionCount += 1;
            if (isPointInsideAnyRoadCarriageway(pb, effectiveCurbPieces)) collisionCount += 1;

            for (const otherCurb of effectiveCurbPieces) {
              if (otherCurb === curb) continue;
              for (let k = 0; k < otherCurb.points.length - 1; k += 1) {
                const oa = { x: otherCurb.points[k].x, y: otherCurb.points[k].y, z: 0 };
                const ob = { x: otherCurb.points[k + 1].x, y: otherCurb.points[k + 1].y, z: 0 };
                if (segmentsProperlyCross(pf, pb, oa, ob)) {
                  collisionCount += 3;
                  break;
                }
              }
            }
          }

          // 2. Check overlap with already-placed NAP lot clusters
          let napOverlapCount = 0;
          if (placedClusters.length > 0) {
            const candPoly: CadPoint[] = [...frontChain, ...[...backChain].reverse()];
            for (const placed of placedClusters) {
              // Check if any candidate sample point falls inside the placed cluster polygon
              for (const pt of candSamplePoints) {
                if (pointInPolygon(pt, placed.polygon)) {
                  napOverlapCount += 3;
                }
              }
              // Check if any placed cluster sample point falls inside this candidate polygon
              for (const pt of placed.samplePoints) {
                if (pointInPolygon(pt, candPoly)) {
                  napOverlapCount += 3;
                }
              }
              // Check if any boundary/transverse edges cross or come within 1.8m of placed edges
              for (const ce of candEdges) {
                for (const pe of placed.edges) {
                  if (segmentsProperlyCross(ce.a, ce.b, pe.a, pe.b)) {
                    napOverlapCount += 4;
                  } else if (
                    segmentDistance(ce.a, pe.a, pe.b) < 1.8 ||
                    segmentDistance(ce.b, pe.a, pe.b) < 1.8
                  ) {
                    napOverlapCount += 1;
                  }
                }
              }
            }
          }

          // Check if backChain itself has extreme self-folding on tight concave curves
          const backCum = polylineCumulativeLengths(backChain);
          const backLen = backCum[backCum.length - 1] || 0;
          const foldPenalty =
            backLen < (sEnd - sStart) * 0.45 || backLen > (sEnd - sStart) * 1.85 ? 180 : 0;

          const lengthDeficitPenalty = Math.max(0, baseDesiredFrontage - (sEnd - sStart)) * 1.1;
          const scalePenalty = (1 - fScale) * 45 + (1 - dScale) * 35;
          const score =
            napOverlapCount * 1500 +
            collisionCount * 280 +
            wrongSidePenalty +
            foldPenalty +
            bestDist * 2.2 +
            Math.abs(shift) * 0.42 +
            lengthDeficitPenalty +
            scalePenalty;

          if (!bestCandidate || score < bestCandidate.score) {
            bestCandidate = {
              frontChain,
              midChain,
              backChain,
              outwardSign: curb.side,
              actualFrontage: sEnd - sStart,
              row1Depth,
              totalDepth,
              score,
            };
          }
        }
      }
    });

    // Fallback when no road boundaries exist near the pole
    if (!bestCandidate) {
      let tangent = { x: 1, y: 0, z: 0 };
      let bestCable: { a: CadPoint; b: CadPoint; dist: number } | null = null;
      cableSegmentsMetric.forEach((seg) => {
        const d = segmentDistance(polePt, seg.a, seg.b);
        if (!bestCable || d < bestCable.dist) {
          bestCable = { ...seg, dist: d };
        }
      });
      if (bestCable !== null) {
        const seg: { a: CadPoint; b: CadPoint; dist: number } = bestCable;
        const len = distance(seg.a, seg.b) || 1;
        tangent = { x: (seg.b.x - seg.a.x) / len, y: (seg.b.y - seg.a.y) / len, z: 0 };
      } else if (allPolesMetric.length >= 2) {
        const nearest = allPolesMetric
          .filter((p) => p.id !== target.id)
          .sort((a, b) => distance(polePt, a.pt) - distance(polePt, b.pt))[0];
        if (nearest) {
          const len = distance(polePt, nearest.pt) || 1;
          tangent = { x: (nearest.pt.x - polePt.x) / len, y: (nearest.pt.y - polePt.y) / len, z: 0 };
        }
      }
      const normal = { x: -tangent.y, y: tangent.x, z: 0 };
      const frontCenter = addScaled(polePt, normal, 4.0);
      const f0 = addScaled(frontCenter, tangent, -baseDesiredFrontage / 2);
      const f1 = addScaled(frontCenter, tangent, baseDesiredFrontage / 2);
      const frontChain = [f0, f1];
      const row1Depth = baseRowDepth;
      const totalDepth = baseRowDepth * 2;
      const midChain = offsetEdge(frontChain, row1Depth).map((p) => ({ x: p.x, y: p.y, z: 0 }));
      const backChain = offsetEdge(frontChain, totalDepth).map((p) => ({ x: p.x, y: p.y, z: 0 }));
      bestCandidate = {
        frontChain,
        midChain,
        backChain,
        outwardSign: 1,
        actualFrontage: baseDesiredFrontage,
        row1Depth,
        totalDepth,
        score: 0,
      };
    }

    const { frontChain, midChain, backChain, outwardSign, actualFrontage, totalDepth } = bestCandidate;

    // Record this placed cluster so subsequent (8-Line) NAPs avoid overlapping it
    {
      const clusterPolygon: CadPoint[] = [...frontChain, ...[...backChain].reverse()];
      const clusterEdges: Array<{ a: CadPoint; b: CadPoint }> = [];
      for (let i = 0; i < frontChain.length - 1; i += 1) {
        clusterEdges.push({ a: frontChain[i], b: frontChain[i + 1] });
      }
      for (let i = 0; i < backChain.length - 1; i += 1) {
        clusterEdges.push({ a: backChain[i], b: backChain[i + 1] });
      }
      clusterEdges.push({ a: frontChain[0], b: backChain[0] });
      clusterEdges.push({ a: frontChain[frontChain.length - 1], b: backChain[backChain.length - 1] });

      const clusterSamples: CadPoint[] = [];
      for (const f of [0.02, 0.2, 0.4, 0.6, 0.8, 0.98]) {
        const pf = samplePolylineAtFraction(frontChain, f).point;
        const pm = samplePolylineAtFraction(midChain, f).point;
        const pb = samplePolylineAtFraction(backChain, f).point;
        clusterSamples.push(pf, pm, pb, interpolate(pf, pm, 0.5), interpolate(pm, pb, 0.5));
      }
      placedClusters.push({
        polygon: clusterPolygon,
        edges: clusterEdges,
        samplePoints: clusterSamples,
      });
    }

    // Uniform column divisions within this NAP
    const colFracs: number[] = [];
    for (let c = 0; c <= cols; c += 1) {
      colFracs.push(c / cols);
    }

    // 1. Longitudinal polylines on "landmk" (color 251): front (sticking flush to road boundary), middle divider, back
    [frontChain, midChain, backChain].forEach((chain) => {
      const outChain = chain.map(outputPoint);
      if (outChain.length >= 2) {
        entities.push(entityPolyline("landmk", outChain, false, 251));
        generatedPoints.push(...outChain);
      }
    });

    // 2. Transverse divider lines on "landmk" (color 251) connecting frontChain -> midChain -> backChain
    for (let c = 0; c <= cols; c += 1) {
      const f = colFracs[c];
      const pFront = outputPoint(samplePolylineAtFraction(frontChain, f).point);
      const pMid = outputPoint(samplePolylineAtFraction(midChain, f).point);
      const pBack = outputPoint(samplePolylineAtFraction(backChain, f).point);
      entities.push(entityPolyline("landmk", [pFront, pMid, pBack], false, 251));
      generatedPoints.push(pFront, pMid, pBack);
    }

    // 3. Outer "NAP BOUNDARY" enclosure (inset by 0.8m on all 4 sides, curving smoothly along the road)
    const insetFrac = Math.min(0.15, napInset / Math.max(actualFrontage, 10));
    const nbFrontFull = offsetEdge(frontChain, outwardSign * napInset).map((p) => ({ x: p.x, y: p.y, z: 0 }));
    const nbBackFull = offsetEdge(frontChain, outwardSign * (totalDepth - napInset)).map((p) => ({ x: p.x, y: p.y, z: 0 }));
    const nbFrontCum = polylineCumulativeLengths(nbFrontFull);
    const nbBackCum = polylineCumulativeLengths(nbBackFull);
    const nbFrontTotal = nbFrontCum[nbFrontCum.length - 1] || 0;
    const nbBackTotal = nbBackCum[nbBackCum.length - 1] || 0;

    const nbFrontMetric = extractPolylineSubchain(
      nbFrontFull,
      nbFrontCum,
      insetFrac * nbFrontTotal,
      (1 - insetFrac) * nbFrontTotal,
    );
    const nbBackMetric = extractPolylineSubchain(
      nbBackFull,
      nbBackCum,
      insetFrac * nbBackTotal,
      (1 - insetFrac) * nbBackTotal,
    );

    const nbFrontOut = nbFrontMetric.map(outputPoint);
    const nbBackOut = nbBackMetric.map(outputPoint);
    if (nbFrontOut.length >= 2 && nbBackOut.length >= 2) {
      const nbBackReversed = [...nbBackOut].reverse();
      entities.push(entityPolyline("NAP BOUNDARY", nbFrontOut, false));
      entities.push(entityPolyline("NAP BOUNDARY", [nbFrontOut[nbFrontOut.length - 1], nbBackOut[nbBackOut.length - 1]], false));
      entities.push(entityPolyline("NAP BOUNDARY", nbBackReversed, false));
      entities.push(entityPolyline("NAP BOUNDARY", [nbBackOut[0], nbFrontOut[0]], false));
      generatedPoints.push(...nbFrontOut, ...nbBackOut);
    }

    // 4. "RES" MTEXT centered in each lot box (10 boxes for 8-line NAP, 16 boxes for 16-line NAP)
    const pScaleA = outputPoint(frontChain[0]);
    const pScaleB = outputPoint(frontChain[frontChain.length - 1]);
    const outFrontSpan = distance(pScaleA, pScaleB) || 1;
    const resTextHeight = usesRawCoordinates
      ? 1.7641679 * (outFrontSpan / Math.max(actualFrontage, 1))
      : 1.7641679;

    for (let c = 0; c < cols; c += 1) {
      const fMid = (colFracs[c] + colFracs[c + 1]) * 0.5;
      const frontSample = samplePolylineAtFraction(frontChain, fMid);
      const midSample = samplePolylineAtFraction(midChain, fMid);
      const backSample = samplePolylineAtFraction(backChain, fMid);

      const tA = outputPoint(frontSample.point);
      const tB = outputPoint({
        x: frontSample.point.x + frontSample.tangent.x * 10,
        y: frontSample.point.y + frontSample.tangent.y * 10,
        z: 0,
      });
      const rawAngle = (Math.atan2(tB.y - tA.y, tB.x - tA.x) * 180) / Math.PI;
      const { rotation } = normalizeReadableTextRotation(rawAngle);

      const rowCenters = [
        interpolate(frontSample.point, midSample.point, 0.5),
        interpolate(midSample.point, backSample.point, 0.5),
      ];

      for (let r = 0; r < rows; r += 1) {
        const centerOut = outputPoint(rowCenters[r]);
        entities.push(
          entityText(
            "landmk",
            "RES",
            centerOut,
            resTextHeight,
            rotation,
            5,
            0,
            251,
            textStyle,
          ),
        );
        generatedPoints.push(centerOut);
      }
    }
  });

  return { entities, points: generatedPoints };
}

function polygonCentroid(points: CadPoint[]) {
  const openPoints = points.length > 1 && distance(points[0], points[points.length - 1]) < 0.05 ? points.slice(0, -1) : points;
  if (!openPoints.length) return { x: 0, y: 0, z: 0 };
  const sum = openPoints.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y, z: acc.z + point.z }), {
    x: 0,
    y: 0,
    z: 0,
  });
  return { x: sum.x / openPoints.length, y: sum.y / openPoints.length, z: sum.z / openPoints.length };
}

function polygonBounds(points: CadPoint[]) {
  return {
    minX: Math.min(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxX: Math.max(...points.map((point) => point.x)),
    maxY: Math.max(...points.map((point) => point.y)),
  };
}

function projectedBuildingLot(
  building: ClassifiedPlacemark,
  roadStart: CadPoint,
  roadEnd: CadPoint,
  roadHalfWidth: number,
  project: (point: LonLat) => CadPoint,
) {
  if (building.geometry.type !== "Polygon") return null;
  const ring = building.geometry.coordinates[0].map(project);
  if (ring.length < 3) return null;

  const length = distance(roadStart, roadEnd);
  if (length < 3) return null;

  const unit = { x: (roadEnd.x - roadStart.x) / length, y: (roadEnd.y - roadStart.y) / length, z: 0 };
  const normal = { x: -unit.y, y: unit.x, z: 0 };
  const centroid = polygonCentroid(ring);
  const rel = { x: centroid.x - roadStart.x, y: centroid.y - roadStart.y, z: 0 };
  const along = rel.x * unit.x + rel.y * unit.y;
  const sideDistance = rel.x * normal.x + rel.y * normal.y;

  if (along < -8 || along > length + 8 || Math.abs(sideDistance) < roadHalfWidth || Math.abs(sideDistance) > 45) {
    return null;
  }

  const side = sideDistance >= 0 ? 1 : -1;
  const sideNormal = { ...normal, x: normal.x * side, y: normal.y * side };
  const bounds = polygonBounds(ring);
  const buildingWidth = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
  const frontage = Math.min(18, Math.max(8, buildingWidth + 3));
  const startAlong = Math.max(0, along - frontage / 2);
  const endAlong = Math.min(length, along + frontage / 2);
  const lotDepth = Math.min(28, Math.max(11, Math.abs(sideDistance) - roadHalfWidth + 7));
  const baseStart = interpolate(roadStart, roadEnd, startAlong / length);
  const baseEnd = interpolate(roadStart, roadEnd, endAlong / length);
  const a = addScaled(baseStart, sideNormal, roadHalfWidth);
  const b = addScaled(baseEnd, sideNormal, roadHalfWidth);
  const c = addScaled(baseEnd, sideNormal, roadHalfWidth + lotDepth);
  const d = addScaled(baseStart, sideNormal, roadHalfWidth + lotDepth);
  const labelPoint = { x: (a.x + b.x + c.x + d.x) / 4, y: (a.y + b.y + c.y + d.y) / 4, z: 0 };

  return { points: [a, b, c, d], labelPoint };
}

const WORLD_MERCATOR_CS_XML = `<?xml version="1.0" encoding="UTF-16" standalone="no" ?>\r\n<Dictionary version="1.0" xmlns="http://www.osgeo.org/mapguide/coordinatesystem">\r\n\r\n<ProjectedCoordinateSystem id="WORLD-MERCATOR">\r\n<Name>WORLD-MERCATOR</Name>\r\n<AdditionalInformation>\r\n<ParameterItem type="CsMap">\r\n<Key>CSQuadrantSimplified</Key>\r\n<IntegerValue>1</IntegerValue>\r\n</ParameterItem>\r\n</AdditionalInformation>\r\n<DomainOfValidity>\r\n<Extent>\r\n<GeographicElement>\r\n<GeographicBoundingBox>\r\n<WestBoundLongitude>-180.75</WestBoundLongitude>\r\n<EastBoundLongitude>180.75</EastBoundLongitude>\r\n<SouthBoundLatitude>-80.75</SouthBoundLatitude>\r\n<NorthBoundLatitude>84.75</NorthBoundLatitude>\r\n</GeographicBoundingBox>\r\n</GeographicElement>\r\n</Extent>\r\n</DomainOfValidity>\r\n<DatumId>WGS84</DatumId>\r\n<Axis uom="Meter">\r\n<CoordinateSystemAxis>\r\n<AxisOrder>1</AxisOrder>\r\n<AxisName>Easting</AxisName>\r\n<AxisAbbreviation>E</AxisAbbreviation>\r\n<AxisDirection>East</AxisDirection>\r\n</CoordinateSystemAxis>\r\n<CoordinateSystemAxis>\r\n<AxisOrder>2</AxisOrder>\r\n<AxisName>Northing</AxisName>\r\n<AxisAbbreviation>N</AxisAbbreviation>\r\n<AxisDirection>North</AxisDirection>\r\n</CoordinateSystemAxis>\r\n</Axis>\r\n<Conversion>\r\n<Projection>\r\n<OperationMethodId>Mercator (variant B)</OperationMethodId>\r\n<ParameterValue><OperationParameterId>Longitude of natural origin</OperationParameterId><Value uom="degree">0</Value></ParameterValue>\r\n<ParameterValue><OperationParameterId>Standard Parallel</OperationParameterId><Value uom="degree">0</Value></ParameterValue>\r\n<ParameterValue><OperationParameterId>Scaling factor for coord differences</OperationParameterId><Value uom="unity">1</Value></ParameterValue>\r\n<ParameterValue><OperationParameterId>False easting</OperationParameterId><Value uom="Meter">0</Value></ParameterValue>\r\n<ParameterValue><OperationParameterId>False northing</OperationParameterId><Value uom="Meter">0</Value></ParameterValue>\r\n</Projection>\r\n</Conversion>\r\n</ProjectedCoordinateSystem>\r\n<Alias id="3395" type="CoordinateSystem">\r\n<ObjectId>WORLD-MERCATOR</ObjectId>\r\n<Namespace>EPSG Code</Namespace>\r\n</Alias>\r\n\r\n<GeodeticDatum id="WGS84">\r\n<Name>WGS84</Name>\r\n<PrimeMeridianId>Greenwich</PrimeMeridianId>\r\n<EllipsoidId>WGS84</EllipsoidId>\r\n</GeodeticDatum>\r\n<Alias id="6326" type="Datum">\r\n<ObjectId>WGS84</ObjectId>\r\n<Namespace>EPSG Code</Namespace>\r\n</Alias>\r\n\r\n<Ellipsoid id="WGS84">\r\n<Name>WGS84</Name>\r\n<SemiMajorAxis uom="meter">6.37814e+06</SemiMajorAxis>\r\n<SecondDefiningParameter>\r\n<SemiMinorAxis uom="meter">6.35675e+06</SemiMinorAxis>\r\n</SecondDefiningParameter>\r\n</Ellipsoid>\r\n<Alias id="7030" type="Ellipsoid">\r\n<ObjectId>WGS84</ObjectId>\r\n<Namespace>EPSG Code</Namespace>\r\n</Alias>\r\n\r\n</Dictionary>\r\n`;

const PSEUDO_MERCATOR_CS_XML = `<?xml version="1.0" encoding="UTF-16" standalone="no" ?>\r\n<Dictionary version="1.0" xmlns="http://www.osgeo.org/mapguide/coordinatesystem">\r\n\r\n<ProjectedCoordinateSystem id="WGS84.PseudoMercator">\r\n<Name>WGS84.PseudoMercator</Name>\r\n<Description>Popular Visualisation CRS / Pseudo Mercator (Spherical formula on WGS84 ellipsoid)</Description>\r\n<DomainOfValidity>\r\n<Extent>\r\n<GeographicElement>\r\n<GeographicBoundingBox>\r\n<WestBoundLongitude>-180.0</WestBoundLongitude>\r\n<EastBoundLongitude>180.0</EastBoundLongitude>\r\n<SouthBoundLatitude>-85.05112878</SouthBoundLatitude>\r\n<NorthBoundLatitude>85.05112878</NorthBoundLatitude>\r\n</GeographicBoundingBox>\r\n</GeographicElement>\r\n</Extent>\r\n</DomainOfValidity>\r\n<DatumId>WGS84</DatumId>\r\n<Axis uom="Meter">\r\n<CoordinateSystemAxis>\r\n<AxisOrder>1</AxisOrder>\r\n<AxisName>Easting</AxisName>\r\n<AxisAbbreviation>X</AxisAbbreviation>\r\n<AxisDirection>East</AxisDirection>\r\n</CoordinateSystemAxis>\r\n<CoordinateSystemAxis>\r\n<AxisOrder>2</AxisOrder>\r\n<AxisName>Northing</AxisName>\r\n<AxisAbbreviation>Y</AxisAbbreviation>\r\n<AxisDirection>North</AxisDirection>\r\n</CoordinateSystemAxis>\r\n</Axis>\r\n<Conversion>\r\n<Projection>\r\n<OperationMethodId>Popular Visualisation Pseudo Mercator</OperationMethodId>\r\n<ParameterValue><OperationParameterId>Latitude of natural origin</OperationParameterId><Value uom="degree">0</Value></ParameterValue>\r\n<ParameterValue><OperationParameterId>Longitude of natural origin</OperationParameterId><Value uom="degree">0</Value></ParameterValue>\r\n<ParameterValue><OperationParameterId>False easting</OperationParameterId><Value uom="Meter">0</Value></ParameterValue>\r\n<ParameterValue><OperationParameterId>False northing</OperationParameterId><Value uom="Meter">0</Value></ParameterValue>\r\n</Projection>\r\n</Conversion>\r\n</ProjectedCoordinateSystem>\r\n<Alias id="3857" type="CoordinateSystem">\r\n<ObjectId>WGS84.PseudoMercator</ObjectId>\r\n<Namespace>EPSG Code</Namespace>\r\n</Alias>\r\n\r\n<GeodeticDatum id="WGS84">\r\n<Name>WGS84</Name>\r\n<PrimeMeridianId>Greenwich</PrimeMeridianId>\r\n<EllipsoidId>WGS84</EllipsoidId>\r\n</GeodeticDatum>\r\n<Alias id="6326" type="Datum">\r\n<ObjectId>WGS84</ObjectId>\r\n<Namespace>EPSG Code</Namespace>\r\n</Alias>\r\n\r\n<Ellipsoid id="WGS84">\r\n<Name>WGS84</Name>\r\n<SemiMajorAxis uom="meter">6.37814e+06</SemiMajorAxis>\r\n<SecondDefiningParameter>\r\n<SemiMinorAxis uom="meter">6.35675e+06</SemiMinorAxis>\r\n</SecondDefiningParameter>\r\n</Ellipsoid>\r\n<Alias id="7030" type="Ellipsoid">\r\n<ObjectId>WGS84</ObjectId>\r\n<Namespace>EPSG Code</Namespace>\r\n</Alias>\r\n\r\n</Dictionary>\r\n`;

function splitDxfStringChunks(text: string, maxLen = 240): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += maxLen) {
    chunks.push(text.slice(i, i + maxLen));
  }
  return chunks;
}

function createDxf(
  placemarks: ClassifiedPlacemark[],
  center: LonLat,
  sourceName: string,
  poleStandard: PoleStandard = defaultPoleStandard,
  coordinateMode: CoordinateMode = "mercator",
  textStyle = "STANDARD",
  telcoProvider: TelcoProvider = "globe",
  roadWidthStandard: RoadWidthStandard = defaultRoadWidthStandard,
  cableSpanStandard: CableSpanStandard = defaultCableSpanStandard,
  hldProposedNaps?: HldProposedNapItem[],
) {
  resetDxfHandles();
  const zone = utmZone(center.lon);
  const projectMetric = (point: LonLat) => lonLatToUtm(point, zone);
  const usesRawCoordinates =
    coordinateMode === "epsg_4326_lat_lon" ||
    coordinateMode === "epsg_4326_lon_lat" ||
    coordinateMode === "raw_lat_lon" ||
    coordinateMode === "raw_lon_lat";
  const projectRaw =
    coordinateMode === "epsg_4326_lat_lon" || coordinateMode === "raw_lat_lon"
      ? latLonToRawCad
      : lonLatToRawCad;
  const projectOutput = usesRawCoordinates
    ? projectRaw
    : coordinateMode === "epsg_3857"
      ? lonLatToPseudoMercator
      : coordinateMode === "mercator"
        ? lonLatToWgs84Mercator
        : projectMetric;
  const metricToOutput = usesRawCoordinates
    ? (point: CadPoint) => projectRaw(utmToLonLat(point, zone, center.lat >= 0))
    : coordinateMode === "epsg_3857"
      ? (point: CadPoint) => lonLatToPseudoMercator(utmToLonLat(point, zone, center.lat >= 0))
      : coordinateMode === "mercator"
        ? (point: CadPoint) => lonLatToWgs84Mercator(utmToLonLat(point, zone, center.lat >= 0))
        : (point: CadPoint) => point;
  const entities: string[] = [];
  const allCadPoints: CadPoint[] = [];
  const geofence = createPoleGeofence(placemarks, projectMetric, 35, 300);
  const poleDeflectionMap = isPldtProvider(telcoProvider) ? computePoleDeflectionMap(placemarks) : new Map<string, number>();
  const roadPlacemarks = placemarks.filter(
    (placemark) => placemark.geometry.type === "LineString" && placemark.layer === "ROAD_CENTERLINES",
  );

  let roadBoundariesMetric: CadPoint[][] = [];
  let roadCurbPieces: RoadCurbPiece[] = [];
  let roadLabelBoxes: RoadLabelBoxInput[] = [];
  if (roadPlacemarks.length > 0) {
    const roadNetworkRes = buildRoadNetworkEntities(
      roadPlacemarks,
      projectMetric,
      geofence,
      metricToOutput,
      usesRawCoordinates,
      roadWidthStandard,
      telcoProvider,
      textStyle,
    );
    if (poleStandard.includeRoads !== false) {
      entities.push(...roadNetworkRes.entities);
      allCadPoints.push(...roadNetworkRes.points);
    }
    roadBoundariesMetric = roadNetworkRes.boundaries;
    roadCurbPieces = roadNetworkRes.curbPieces;
    roadLabelBoxes = roadNetworkRes.labelBoxes;
  }

  const cableChainsMetric = placemarks
    .filter(
      (placemark): placemark is ClassifiedPlacemark & { geometry: { type: "LineString"; coordinates: { lon: number; lat: number }[] } } =>
        placemark.geometry.type === "LineString" &&
        (placemark.layer === "CABLE_ROUTES" || placemark.layer === "SPAN" || placemark.layer === "SOURCE_LINES"),
    )
    .map((placemark) => placemark.geometry.coordinates.map(projectMetric));

  const poleInputs = placemarks
    .filter(
      (placemark): placemark is ClassifiedPlacemark & { geometry: { type: "Point"; coordinates: { lon: number; lat: number } } } =>
        placemark.geometry.type === "Point",
    )
    .map((placemark) => {
      const preview = previewPoleStencilAttributes(placemark, telcoProvider, poleDeflectionMap.get(placemark.id) || 0);
      const isPldt = isPldtProvider(telcoProvider);
      return {
        id: placemark.id,
        origPt: projectMetric(placemark.geometry.coordinates),
        textWidthUnscaled: isPldt ? 15.0 : preview.blockName === "P-POLE" ? 19.0 : 22.0,
        textHeightUnscaled: isPldt ? (preview.blockName === "NEW_PROPOSE POLE_SYSMBOL" ? 8.2 : 5.8) : 11.2,
      };
    });

  const poleLayoutMap = computePoleLayouts(
    poleInputs,
    roadCurbPieces,
    cableChainsMetric,
    roadLabelBoxes,
    1.15,
    cableSpanStandard.roadInsetOffset ?? 3.5,
  );

  const snapMetricToRoadNearPole = (pt: CadPoint): CadPoint => {
    let bestLayout: PoleLayoutResult | undefined;
    let bestDist = 25.0;
    poleLayoutMap.forEach((layout) => {
      const d = distance(pt, layout.origPt);
      if (d < bestDist) {
        bestDist = d;
        bestLayout = layout;
      }
    });
    if (bestLayout) {
      return bestLayout.cablePt ? { x: bestLayout.cablePt.x, y: bestLayout.cablePt.y, z: 0 } : bestLayout.origPt;
    }
    return pt;
  };

  const refineCableRouteWithAllPoles = (metricCoords: CadPoint[]): CadPoint[] => {
    if (metricCoords.length < 2) return metricCoords;
    const result: CadPoint[] = [];

    for (let i = 0; i < metricCoords.length - 1; i++) {
      const p1 = metricCoords[i];
      const p2 = metricCoords[i + 1];
      if (i === 0) result.push(p1);

      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const lenSq = dx * dx + dy * dy;
      if (lenSq < 0.2) continue;

      // Find any surveyed poles that lie along this segment [p1, p2]
      const onSegment: { t: number; pt: CadPoint }[] = [];
      poleLayoutMap.forEach((layout) => {
        const polePt = layout.origPt;
        const t = ((polePt.x - p1.x) * dx + (polePt.y - p1.y) * dy) / lenSq;
        // If strictly between p1 and p2 (excluding endpoints)
        if (t > 0.05 && t < 0.95) {
          const projX = p1.x + t * dx;
          const projY = p1.y + t * dy;
          const distToSeg = Math.hypot(polePt.x - projX, polePt.y - projY);
          // If the pole is within 25 meters of this cable segment
          if (distToSeg <= 25.0) {
            const roadNearPole = layout.cablePt
              ? { x: layout.cablePt.x, y: layout.cablePt.y, z: 0 }
              : { x: projX, y: projY, z: 0 };
            onSegment.push({ t, pt: roadNearPole });
          }
        }
      });

      onSegment.sort((a, b) => a.t - b.t);
      for (const item of onSegment) {
        result.push(item.pt);
      }
      result.push(p2);
    }

    return result;
  };

  placemarks.forEach((placemark) => {
    if (placemark.geometry.type === "Point") {
      const layout = poleLayoutMap.get(placemark.id);
      const cadPoint = layout ? metricToOutput(layout.adjustedPt) : projectOutput(placemark.geometry.coordinates);
      allCadPoints.push(cadPoint);
      if (poleStandard.includePoleStencils !== false) {
        if (poleStandard.markerStyle === "ownerBlock") {
          const scale = usesRawCoordinates ? poleStandard.markerSize : 1.15;
          const deflectionDeg = poleDeflectionMap.get(placemark.id) || 0;
          entities.push(...entityBlockInsertWithAttributes(placemark, cadPoint, scale, telcoProvider, deflectionDeg, layout));
        } else {
          entities.push(...poleMarkerEntities(cadPoint, poleStandard));
          entities.push(
            entityMultilineText(
              "POLE_LABELS",
              renderPoleLabel(placemark, poleStandard),
              { x: cadPoint.x + poleStandard.labelOffsetX, y: cadPoint.y + poleStandard.labelOffsetY, z: cadPoint.z },
              poleStandard.labelHeight,
              0,
              isProposedPole(placemark) ? 1 : undefined,
              textStyle,
            ),
          );
        }
      }
      return;
    }

    if (placemark.geometry.type === "LineString") {
      if (placemark.layer === "ROAD_CENTERLINES" || placemark.layer === "ROAD_BOUNDARIES") {
        if (poleStandard.includeRoads === false) return;
        if (placemark.layer === "ROAD_BOUNDARIES") {
          const outputPoints = placemark.geometry.coordinates.map(projectOutput);
          allCadPoints.push(...outputPoints);
          entities.push(entityPolyline(placemark.layer, outputPoints, false));
        }
        return;
      }
      if (placemark.layer === "CABLE_ROUTES" || placemark.layer === "SPAN" || placemark.layer === "SOURCE_LINES") {
        if (poleStandard.includeFocCable === false) {
          return;
        }
        const rawMetricPoints = placemark.geometry.coordinates.map(projectMetric);
        const snappedMetricPoints = rawMetricPoints.map(snapMetricToRoadNearPole);
        const refinedMetricPoints = refineCableRouteWithAllPoles(snappedMetricPoints);
        const outputPoints = refinedMetricPoints.map(metricToOutput);
        const cableRes = buildCableRouteEntities(
          placemark,
          refinedMetricPoints,
          outputPoints,
          usesRawCoordinates,
          textStyle,
          cableSpanStandard.allowanceMeters,
          telcoProvider,
          poleStandard.includeSpanMeasurements !== false,
        );
        entities.push(...cableRes.entities);
        allCadPoints.push(...cableRes.points);
        return;
      }
      const outputPoints = placemark.geometry.coordinates.map(projectOutput);
      allCadPoints.push(...outputPoints);
      entities.push(entityPolyline(placemark.layer, outputPoints, false));
      return;
    }

    placemark.geometry.coordinates.forEach((ring) => {
      const metricPoints = ring.map(projectMetric);
      const points = ring.map(projectOutput);
      const isDemand = (
        placemark.layer === "BUILDING_FOOTPRINTS" ||
        placemark.layer === "RESIDENTIAL_AREAS" ||
        placemark.layer === "COMMERCIAL_AREAS" ||
        placemark.layer === "INDUSTRIAL_AREAS" ||
        placemark.layer === "COMMUNITY_AREAS"
      );
      if (isDemand && poleStandard.includeDemandPolygons === false) {
        return;
      }
      if (isDemand && geofence && !metricPoints.some((point) => pointInsideGeofence(point, geofence))) {
        return;
      }
      allCadPoints.push(...points);
      entities.push(entityPolyline(placemark.layer, points, true));
    });
  });

  if (poleStandard.includeDemandPolygons !== false) {
    const resLotBoxesRes = buildProposedNapResLotBoxesEntities(
      placemarks,
      roadBoundariesMetric,
      roadCurbPieces,
      projectMetric,
      metricToOutput,
      usesRawCoordinates,
      textStyle,
      hldProposedNaps,
    );
    if (resLotBoxesRes.entities.length > 0) {
      entities.push(...resLotBoxesRes.entities);
      allCadPoints.push(...resLotBoxesRes.points);
    }
  }

  const hasExplicitCableRoutes = placemarks.some(
    (placemark) => placemark.geometry.type === "LineString" && (placemark.layer === "CABLE_ROUTES" || placemark.layer === "SPAN" || placemark.layer === "SOURCE_LINES"),
  );
  if (poleStandard.includeFocCable !== false && !hasExplicitCableRoutes) {
    const polePointsMetric: CadPoint[] = [];
    const polePointsOutput: CadPoint[] = [];
    placemarks.forEach((placemark) => {
      if (placemark.geometry.type === "Point") {
        const layout = poleLayoutMap.get(placemark.id);
        const roadNearPoleMetric = layout
          ? (layout.cablePt ? { x: layout.cablePt.x, y: layout.cablePt.y, z: 0 } : layout.origPt)
          : projectMetric(placemark.geometry.coordinates);
        const roadNearPoleOutput = metricToOutput(roadNearPoleMetric);
        polePointsMetric.push(roadNearPoleMetric);
        polePointsOutput.push(roadNearPoleOutput);
      }
    });
    if (polePointsMetric.length >= 2) {
      const poleSpans = buildPoleSpansEntities(
        polePointsMetric,
        polePointsOutput,
        usesRawCoordinates,
        textStyle,
        cableSpanStandard.allowanceMeters,
        130.0,
        telcoProvider,
        poleStandard.includeSpanMeasurements !== false,
      );
      entities.push(...poleSpans.entities);
      allCadPoints.push(...poleSpans.points);
    }
  }

  const allSitePoleOutputPts: CadPoint[] = [];
  placemarks.forEach((placemark) => {
    if (placemark.geometry.type === "Point") {
      const layout = poleLayoutMap.get(placemark.id);
      const adjOutput = layout ? metricToOutput(layout.adjustedPt) : projectOutput(placemark.geometry.coordinates);
      allSitePoleOutputPts.push(adjOutput);
    }
  });
  if (Boolean(poleStandard.includeGridPagingBox) && allSitePoleOutputPts.length > 0) {
    const gridPagingRes = buildGridPagingBoxEntities(
      allSitePoleOutputPts,
      allCadPoints,
      usesRawCoordinates,
      dxfPair,
      dxfHandle,
      cadCoord,
      cadSize,
    );
    if (gridPagingRes.entities.length > 0) {
      entities.push(...gridPagingRes.entities);
      allCadPoints.push(...gridPagingRes.points);
    }
  }

  const notePadding = usesRawCoordinates ? 0.0002 : 20;
  const noteAnchor =
    allCadPoints.length > 0
      ? {
          x: Math.min(...allCadPoints.map((point) => point.x)),
          y: Math.max(...allCadPoints.map((point) => point.y)) + notePadding * 0.6,
          z: 0,
      }
      : projectOutput(center);

  const noteTextHeight = usesRawCoordinates ? 0.000025 : 2.5;
  const noteLineGap = usesRawCoordinates ? 0.00004 : 4;
  entities.push(entityText("FTTH_NOTES", `FTTH base template generated from ${sourceName} (${formatProviderLabel(telcoProvider)} Standard)`, noteAnchor, noteTextHeight, 0, 1, Math.max(noteTextHeight * 12, 8), undefined, textStyle));
  entities.push(
    entityText(
      "FTTH_NOTES",
      coordinateMode === "mercator"
        ? "Coordinate system: WGS 84 / World Mercator (EPSG:3395) meters; X = Easting, Y = Northing"
        : coordinateMode === "epsg_3857"
          ? "Coordinate system: WGS 84 / Pseudo-Mercator (EPSG:3857) meters; X = Easting, Y = Northing"
          : coordinateMode === "epsg_4326_lat_lon" || coordinateMode === "raw_lat_lon"
            ? "Coordinate system: WGS 84 (EPSG:4326) degrees; X = Latitude, Y = Longitude"
            : coordinateMode === "epsg_4326_lon_lat" || coordinateMode === "raw_lon_lat"
              ? "Coordinate system: WGS 84 (EPSG:4326) degrees; X = Longitude, Y = Latitude"
              : `Coordinate system: WGS84 to UTM Zone ${zone}${center.lat < 0 ? "S" : "N"}; units: meters`,
      { ...noteAnchor, y: noteAnchor.y - noteLineGap },
      noteTextHeight,
      0,
      1,
      Math.max(noteTextHeight * 12, 8),
      undefined,
      textStyle,
    ),
  );
  entities.push(
    entityText(
      "FTTH_NOTES",
      "Road layout filtered to pole traverse corridor: 45 m path tolerance, 70 m pole/intersection fallback, 150 m fetch allowance",
      { ...noteAnchor, y: noteAnchor.y - noteLineGap * 2 },
      noteTextHeight,
      0,
      1,
      Math.max(noteTextHeight * 12, 8),
      undefined,
      textStyle,
    ),
  );
  entities.push(
    entityText(
      "FTTH_NOTES",
      `Aerial cable spans include +${cableSpanStandard.allowanceMeters.toFixed(1)}m length allowance on layer SPAN (1 decimal place)`,
      { ...noteAnchor, y: noteAnchor.y - noteLineGap * 3 },
      noteTextHeight,
      0,
      1,
      Math.max(noteTextHeight * 12, 8),
      undefined,
      textStyle,
    ),
  );
  if (placemarks.some((placemark) => placemark.properties.source === "OpenStreetMap")) {
    entities.push(
      entityText(
        "FTTH_NOTES",
        "Road centerlines: OpenStreetMap contributors, ODbL - https://www.openstreetmap.org/copyright",
        { ...noteAnchor, y: noteAnchor.y - noteLineGap * 4 },
        noteTextHeight,
        0,
        1,
        Math.max(noteTextHeight * 12, 8),
        undefined,
        textStyle,
      ),
    );
  }

  entities.push(
    entityText(
      "FTTH_NOTES",
      "© 2026 Caesar Ian Samulde. All Rights Reserved. Reverse engineering, resale, and unauthorized copying are strictly prohibited.",
      { ...noteAnchor, y: noteAnchor.y - noteLineGap * (placemarks.some((placemark) => placemark.properties.source === "OpenStreetMap") ? 5 : 4) },
      noteTextHeight,
      0,
      1,
      Math.max(noteTextHeight * 12, 8),
      undefined,
      textStyle,
    ),
  );

  if (isPldtProvider(telcoProvider) && placemarks.length > 0) {
    const clampBoxOrigin = {
      x: noteAnchor.x,
      y: noteAnchor.y + (usesRawCoordinates ? 0.00012 : 12),
      z: 0,
    };
    const clampBoxScale = usesRawCoordinates ? 0.00001 : 1.0;
    entities.push(...buildPldtPoleClampStencilBoxEntities(clampBoxOrigin, clampBoxScale));
  }

  const extentPadding = usesRawCoordinates ? 0.0002 : 20;
  const extents = allCadPoints.length
    ? {
        minX: Math.min(...allCadPoints.map((point) => point.x)) - extentPadding,
        minY: Math.min(...allCadPoints.map((point) => point.y)) - extentPadding,
        maxX: Math.max(...allCadPoints.map((point) => point.x)) + extentPadding,
        maxY: Math.max(...allCadPoints.map((point) => point.y)) + extentPadding,
      }
    : { minX: 0, minY: 0, maxX: 100, maxY: 100 };

  // AutoCAD requires a valid plot-style handle on every LAYER record. Keep the small,
  // self-contained dictionary here so the DXF opens instead of being discarded.
  const namedObjectDictionaryHandle = dxfHandle();
  const groupDictionaryHandle = dxfHandle();
  const plotStyleDictionaryHandle = dxfHandle();
  const plotStyleNormalHandle = dxfHandle();
  const geodataHandle =
    coordinateMode === "epsg_3857" || coordinateMode === "mercator"
      ? dxfHandle()
      : null;
  const modelSpaceBlockRecordHandle = dxfHandle();
  const modelSpaceXDictHandle = geodataHandle ? dxfHandle() : null;

  const distinctLayers = new Set<string>(Object.keys(layerMeta));
  for (const p of placemarks) {
    if (p.layer) distinctLayers.add(p.layer);
  }
  const dxfLayerEntries: Array<[string, { color: number }]> = Array.from(distinctLayers).map((l) => [
    l,
    { color: l === "ROAD_LABELS" ? (isPldtProvider(telcoProvider) ? 5 : 2) : getLayerColor(l) },
  ]);
  const layers = dxfLayerEntries.flatMap(([layer, meta]) => [
    dxfPair(0, "LAYER"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbSymbolTableRecord"),
    dxfPair(100, "AcDbLayerTableRecord"),
    dxfPair(2, layer),
    dxfPair(70, 0),
    dxfPair(62, meta.color),
    dxfPair(6, layer === "NAP BOUNDARY" ? "NAP_BOUNDARY" : "CONTINUOUS"),
    dxfPair(370, layer === "landmk" ? 13 : -3),
    dxfPair(390, plotStyleNormalHandle),
  ]);

  const emptySymbolTable = (name: string) => [
    dxfPair(0, "TABLE"),
    dxfPair(2, name),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbSymbolTable"),
    ...(name === "DIMSTYLE" ? [dxfPair(100, "AcDbDimStyleTable")] : []),
    dxfPair(70, 0),
    dxfPair(0, "ENDTAB"),
  ];

  const textStyles = [
    ["STANDARD", "arial.ttf", ""],
    ["样式 1", "SimSun.ttf", ""],
    ["SIMPLEX", "simplex.shx", ""],
    ["ROMANS", "romans.shx", ""],
    ["CGOMEGA", "simplex.shx", ""],
    ["BOLD", "swisscbo.ttf", ""],
    ["Annotative", "arial.ttf", ""],
  ];
  const standardTextStyleHandle = dxfHandle();
  const textStyleTable = [
    dxfPair(0, "TABLE"),
    dxfPair(2, "STYLE"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbSymbolTable"),
    dxfPair(70, textStyles.length),
    ...textStyles.flatMap(([name, font, bigfont], idx) => [
      dxfPair(0, "STYLE"),
      dxfPair(5, idx === 0 ? standardTextStyleHandle : dxfHandle()),
      dxfPair(100, "AcDbSymbolTableRecord"),
      dxfPair(100, "AcDbTextStyleTableRecord"),
      dxfPair(2, name),
      dxfPair(70, 0),
      dxfPair(40, 0),
      dxfPair(41, 1),
      dxfPair(50, 0),
      dxfPair(71, 0),
      dxfPair(42, 1),
      dxfPair(3, font),
      dxfPair(4, bigfont || ""),
    ]),
    dxfPair(0, "ENDTAB"),
  ];

  const ltypeTable = [
    dxfPair(0, "TABLE"),
    dxfPair(2, "LTYPE"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbSymbolTable"),
    dxfPair(70, 4),
    ...[
      ["ByBlock", ""],
      ["ByLayer", ""],
      ["CONTINUOUS", "Solid line"],
    ].flatMap(([name, description]) => [
      dxfPair(0, "LTYPE"),
      dxfPair(5, dxfHandle()),
      dxfPair(100, "AcDbSymbolTableRecord"),
      dxfPair(100, "AcDbLinetypeTableRecord"),
      dxfPair(2, name),
      dxfPair(70, 0),
      dxfPair(3, description),
      dxfPair(72, 65),
      dxfPair(73, 0),
      dxfPair(40, 0),
    ]),
    dxfPair(0, "LTYPE"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbSymbolTableRecord"),
    dxfPair(100, "AcDbLinetypeTableRecord"),
    dxfPair(2, "NAP_BOUNDARY"),
    dxfPair(70, 0),
    dxfPair(3, "NAP Boundary ---- NAP ---- NAP ---- NAP ---- NA"),
    dxfPair(72, 65),
    dxfPair(73, 3),
    dxfPair(40, "4.6"),
    dxfPair(49, "3.0"),
    dxfPair(74, 0),
    dxfPair(49, "-1.0"),
    dxfPair(74, 10),
    dxfPair(75, 0),
    dxfPair(340, standardTextStyleHandle),
    dxfPair(46, "0.4"),
    dxfPair(50, "0.0"),
    dxfPair(44, "-0.73"),
    dxfPair(45, "-0.2"),
    dxfPair(9, "NAP"),
    dxfPair(49, "-0.6"),
    dxfPair(74, 0),
    dxfPair(0, "ENDTAB"),
  ];

  // Block records: model space (with optional Geodata XDict), paper space, and provider-specific dynamic pole block records
  const rawPoleBlockDefs =
    isPldtProvider(telcoProvider)
      ? [
          { name: "NEW_PLDT_SYSMBOL", rawDxf: newPldtSymbolBlockDefinition() },
          { name: "NEW_PROPOSE POLE_SYSMBOL", rawDxf: newProposePoleSymbolBlockDefinition() },
          { name: "NEW_ELECTRIC_SYSMBOL", rawDxf: newElectricSymbolBlockDefinition() },
        ]
      : [
          { name: "PTPOLE", rawDxf: ptPoleBlockDefinition() },
          { name: "EPOLE", rawDxf: epoleBlockDefinition() },
          { name: "P-POLE", rawDxf: pPoleBlockDefinition() },
        ];

  const poleBlockRecords = rawPoleBlockDefs.map((item) => ({
    name: item.name,
    recordHandle: dxfHandle(),
    blockDxf: item.rawDxf,
  }));

  const blockRecordTable = [
    dxfPair(0, "TABLE"),
    dxfPair(2, "BLOCK_RECORD"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbSymbolTable"),
    dxfPair(70, 2 + poleBlockRecords.length),
    dxfPair(0, "BLOCK_RECORD"),
    dxfPair(5, modelSpaceBlockRecordHandle),
    ...(modelSpaceXDictHandle
      ? [
          dxfPair(102, "{ACAD_XDICTIONARY"),
          dxfPair(360, modelSpaceXDictHandle),
          dxfPair(102, "}"),
        ]
      : []),
    dxfPair(100, "AcDbSymbolTableRecord"),
    dxfPair(100, "AcDbBlockTableRecord"),
    dxfPair(2, "*MODEL_SPACE"),
    dxfPair(0, "BLOCK_RECORD"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbSymbolTableRecord"),
    dxfPair(100, "AcDbBlockTableRecord"),
    dxfPair(2, "*PAPER_SPACE"),
    ...poleBlockRecords.flatMap((rec) => [
      dxfPair(0, "BLOCK_RECORD"),
      dxfPair(5, rec.recordHandle),
      dxfPair(100, "AcDbSymbolTableRecord"),
      dxfPair(100, "AcDbBlockTableRecord"),
      dxfPair(2, rec.name),
    ]),
    dxfPair(0, "ENDTAB"),
  ];

  const appIdTable = [
    dxfPair(0, "TABLE"),
    dxfPair(2, "APPID"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbSymbolTable"),
    dxfPair(70, 2),
    ...["ACAD", "AcadAnnotative"].flatMap((name) => [
      dxfPair(0, "APPID"),
      dxfPair(5, dxfHandle()),
      dxfPair(100, "AcDbSymbolTableRecord"),
      dxfPair(100, "AcDbRegAppTableRecord"),
      dxfPair(2, name),
      dxfPair(70, 0),
    ]),
    dxfPair(0, "ENDTAB"),
  ];

  const layerTable = [
    dxfPair(0, "TABLE"),
    dxfPair(2, "LAYER"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbSymbolTable"),
    dxfPair(70, dxfLayerEntries.length),
    ...layers,
    dxfPair(0, "ENDTAB"),
  ];

  const vportTable = emptySymbolTable("VPORT");
  const viewTable = emptySymbolTable("VIEW");
  const ucsTable = emptySymbolTable("UCS");
  const dimStyleTable = emptySymbolTable("DIMSTYLE");
  const modelSpace = emptyBlockDefinition("*MODEL_SPACE");
  const paperSpace = emptyBlockDefinition("*PAPER_SPACE");
  const providerBlocks = poleBlockRecords.map((rec) => rec.blockDxf);
  const dynamicBlockObjects: string[] = [];

  const activeCsXml =
    coordinateMode === "mercator" ? WORLD_MERCATOR_CS_XML : PSEUDO_MERCATOR_CS_XML;
  const escapedXml = activeCsXml.replace(/\r\n/g, "^J").replace(/\n/g, "^J");
  const geodataXmlChunks = splitDxfStringChunks(escapedXml);
  const geodataXmlPairs = geodataXmlChunks.flatMap((chunk, idx) => [
    dxfPair(idx === geodataXmlChunks.length - 1 ? 301 : 303, chunk),
  ]);

  const classesSection = [
    dxfPair(0, "SECTION"),
    dxfPair(2, "CLASSES"),
    dxfPair(0, "CLASS"),
    dxfPair(1, "ACDBDICTIONARYWDFLT"),
    dxfPair(2, "AcDbDictionaryWithDefault"),
    dxfPair(3, "ObjectDBX Classes"),
    dxfPair(90, 0),
    dxfPair(91, 1),
    dxfPair(280, 0),
    dxfPair(281, 0),
    ...(geodataHandle
      ? [
          dxfPair(0, "CLASS"),
          dxfPair(1, "GEODATA"),
          dxfPair(2, "AcDbGeoData"),
          dxfPair(3, "ObjectDBX Classes"),
          dxfPair(90, 4095),
          dxfPair(91, 1),
          dxfPair(280, 0),
          dxfPair(281, 0),
        ]
      : []),
    dxfPair(0, "CLASS"),
    dxfPair(1, "ACAD_EVALUATION_GRAPH"),
    dxfPair(2, "AcDbEvalGraph"),
    dxfPair(3, "ObjectDBX Classes"),
    dxfPair(90, 1153),
    dxfPair(91, poleBlockRecords.length),
    dxfPair(280, 0),
    dxfPair(281, 0),
    dxfPair(0, "CLASS"),
    dxfPair(1, "BLOCKROTATIONPARAMETER"),
    dxfPair(2, "AcDbBlockRotationParameter"),
    dxfPair(3, "ObjectDBX Classes"),
    dxfPair(90, 1153),
    dxfPair(91, poleBlockRecords.length),
    dxfPair(280, 0),
    dxfPair(281, 0),
    dxfPair(0, "CLASS"),
    dxfPair(1, "BLOCKROTATIONGRIP"),
    dxfPair(2, "AcDbBlockRotationGrip"),
    dxfPair(3, "ObjectDBX Classes"),
    dxfPair(90, 1153),
    dxfPair(91, poleBlockRecords.length),
    dxfPair(280, 0),
    dxfPair(281, 0),
    dxfPair(0, "CLASS"),
    dxfPair(1, "BLOCKGRIPLOCATIONCOMPONENT"),
    dxfPair(2, "AcDbBlockGripExpr"),
    dxfPair(3, "ObjectDBX Classes"),
    dxfPair(90, 1153),
    dxfPair(91, poleBlockRecords.length * 2),
    dxfPair(280, 0),
    dxfPair(281, 0),
    dxfPair(0, "CLASS"),
    dxfPair(1, "BLOCKROTATEACTION"),
    dxfPair(2, "AcDbBlockRotateAction"),
    dxfPair(3, "ObjectDBX Classes"),
    dxfPair(90, 1153),
    dxfPair(91, poleBlockRecords.length),
    dxfPair(280, 0),
    dxfPair(281, 0),
    dxfPair(0, "CLASS"),
    dxfPair(1, "ACDB_DYNAMICBLOCKPURGEPREVENTER_VERSION"),
    dxfPair(2, "AcDbDynamicBlockPurgePreventer"),
    dxfPair(3, "ObjectDBX Classes"),
    dxfPair(90, 1153),
    dxfPair(91, poleBlockRecords.length),
    dxfPair(280, 0),
    dxfPair(281, 0),
    dxfPair(0, "ENDSEC"),
  ];

  const objectsSection = [
    dxfPair(0, "DICTIONARY"),
    dxfPair(5, namedObjectDictionaryHandle),
    dxfPair(100, "AcDbDictionary"),
    dxfPair(281, 1),
    dxfPair(3, "ACAD_GROUP"),
    dxfPair(350, groupDictionaryHandle),
    dxfPair(3, "ACAD_PLOTSTYLENAME"),
    dxfPair(350, plotStyleDictionaryHandle),
    dxfPair(0, "DICTIONARY"),
    dxfPair(5, groupDictionaryHandle),
    dxfPair(100, "AcDbDictionary"),
    dxfPair(281, 1),
    dxfPair(0, "ACDBDICTIONARYWDFLT"),
    dxfPair(5, plotStyleDictionaryHandle),
    dxfPair(330, namedObjectDictionaryHandle),
    dxfPair(100, "AcDbDictionary"),
    dxfPair(281, 1),
    dxfPair(3, "Normal"),
    dxfPair(350, plotStyleNormalHandle),
    dxfPair(100, "AcDbDictionaryWithDefault"),
    dxfPair(340, plotStyleNormalHandle),
    dxfPair(0, "ACDBPLACEHOLDER"),
    dxfPair(5, plotStyleNormalHandle),
    dxfPair(330, plotStyleDictionaryHandle),
    ...(geodataHandle && modelSpaceXDictHandle
      ? [
          dxfPair(0, "DICTIONARY"),
          dxfPair(5, modelSpaceXDictHandle),
          dxfPair(330, modelSpaceBlockRecordHandle),
          dxfPair(100, "AcDbDictionary"),
          dxfPair(281, 1),
          dxfPair(3, "ACAD_GEOGRAPHICDATA"),
          dxfPair(350, geodataHandle),
          dxfPair(0, "GEODATA"),
          dxfPair(5, geodataHandle),
          dxfPair(102, "{ACAD_REACTORS"),
          dxfPair(330, modelSpaceXDictHandle),
          dxfPair(102, "}"),
          dxfPair(330, modelSpaceXDictHandle),
          dxfPair(100, "AcDbGeoData"),
          dxfPair(90, 2),
          dxfPair(330, 0),
          dxfPair(70, 3),
          dxfPair(10, cadCoord(projectOutput(center).x)),
          dxfPair(20, cadCoord(projectOutput(center).y)),
          dxfPair(30, "0.0"),
          dxfPair(11, center.lon.toFixed(8)),
          dxfPair(21, center.lat.toFixed(8)),
          dxfPair(31, "0.0"),
          dxfPair(40, "1.0"),
          dxfPair(91, 6),
          dxfPair(41, "1.0"),
          dxfPair(92, 6),
          dxfPair(210, "0.0"),
          dxfPair(220, "0.0"),
          dxfPair(230, "1.0"),
          dxfPair(12, "0.0"),
          dxfPair(22, "1.0"),
          dxfPair(95, 1),
          dxfPair(141, "1.0"),
          dxfPair(294, 0),
          dxfPair(142, "0.0"),
          dxfPair(143, "0.0"),
          ...geodataXmlPairs,
          dxfPair(93, 0),
          dxfPair(96, 0),
        ]
      : []),
    ...dynamicBlockObjects,
  ];

  // All handles across tables, blocks, entities, and objects are now assigned.
  // $HANDSEED must strictly exceed the highest handle allocated anywhere in the file.
  const handseed = (dxfHandleCounter + 100).toString(16).toUpperCase();

  const dxf = [
    dxfPair(999, "================================================================================"),
    dxfPair(999, "FTTH KMZ to AutoCAD Automated Conversion Suite"),
    dxfPair(999, "Copyright (c) 2026 Caesar Ian Samulde. All Rights Reserved."),
    dxfPair(999, "PROPRIETARY & CONFIDENTIAL. Reverse engineering, decompilation, resale,"),
    dxfPair(999, "and unauthorized copying or distribution are strictly prohibited."),
    dxfPair(999, "================================================================================"),
    dxfPair(0, "SECTION"),
    dxfPair(2, "HEADER"),
    dxfPair(9, "$ACADVER"),
    dxfPair(1, "AC1024"),
    dxfPair(9, "$HANDSEED"),
    dxfPair(5, handseed),
    dxfPair(9, "$INSUNITS"),
    dxfPair(70, usesRawCoordinates ? 0 : 6),
    dxfPair(9, "$MIRRTEXT"),
    dxfPair(70, 0),
    dxfPair(9, "$EXTMIN"),
    dxfPair(10, cadCoord(extents.minX)),
    dxfPair(20, cadCoord(extents.minY)),
    dxfPair(30, "0.0"),
    dxfPair(9, "$EXTMAX"),
    dxfPair(10, cadCoord(extents.maxX)),
    dxfPair(20, cadCoord(extents.maxY)),
    dxfPair(30, "0.0"),
    dxfPair(0, "ENDSEC"),
    ...classesSection,
    dxfPair(0, "SECTION"),
    dxfPair(2, "TABLES"),
    // AutoCAD table order is required for reliable open.
    ...vportTable,
    ...ltypeTable,
    ...layerTable,
    ...textStyleTable,
    ...viewTable,
    ...ucsTable,
    ...appIdTable,
    ...dimStyleTable,
    ...blockRecordTable,
    dxfPair(0, "ENDSEC"),
    dxfPair(0, "SECTION"),
    dxfPair(2, "BLOCKS"),
    modelSpace,
    paperSpace,
    ...providerBlocks,
    dxfPair(0, "ENDSEC"),
    dxfPair(0, "SECTION"),
    dxfPair(2, "ENTITIES"),
    ...entities,
    dxfPair(0, "ENDSEC"),
    dxfPair(0, "SECTION"),
    dxfPair(2, "OBJECTS"),
    ...objectsSection,
    dxfPair(0, "ENDSEC"),
    dxfPair(0, "EOF"),
    "",
  ].join("\n");

  return { dxf, zone };
}

function buildHldFocCables(
  placemarks: ClassifiedNapPlacemark[],
  projectMetric: (point: LonLat) => CadPoint,
  projectOutput: (point: LonLat) => CadPoint,
  metricToOutput: (point: CadPoint) => CadPoint,
  usesRawCoordinates: boolean,
  standard: HldNapStandard,
  textStyle = "STANDARD",
): { entities: string[]; points: CadPoint[]; generatedLines: Array<{ name: string; coordinates: LonLat[] }> } {
  const entities: string[] = [];
  const points: CadPoint[] = [];
  const generatedLines: Array<{ name: string; coordinates: LonLat[] }> = [];

  const focLayer: LayerName = standard.telcoProvider === "pldt" ? "CABLE_ROUTES" : "P-AERIAL_FOC";
  const focColor = standard.telcoProvider === "pldt" ? 6 : 1;
  const textHeight = usesRawCoordinates ? 0.000018 : 1.5;

  // Filter Points
  const naps = placemarks.filter(
    (p): p is ClassifiedNapPlacemark & { geometry: { type: "Point"; coordinates: LonLat } } =>
      p.geometry.type === "Point" && p.layer !== "CLUSTER_BOUNDARIES" && p.layer !== "OLT_POI" && !isPolePlacemark(p),
  );

  const poles = placemarks.filter(
    (p): p is ClassifiedNapPlacemark & { geometry: { type: "Point"; coordinates: LonLat } } =>
      p.geometry.type === "Point" && isPolePlacemark(p),
  );

  const sources = placemarks.filter(
    (p): p is ClassifiedNapPlacemark & { geometry: { type: "Point"; coordinates: LonLat } } =>
      p.geometry.type === "Point" &&
      (p.layer === "OLT_POI" ||
        p.status === "SOURCE" ||
        p.status === "EXISTING" ||
        hasExistingNapIdentifier(p.name) ||
        /olt|closure|fdh|lcp/i.test(p.name)),
  );

  // Filter Explicit Lines (excluding cluster boundaries & roads)
  const explicitLines = placemarks.filter(
    (p): p is ClassifiedNapPlacemark & { geometry: { type: "LineString"; coordinates: LonLat[] } } =>
      p.geometry.type === "LineString" &&
      p.layer !== "CLUSTER_BOUNDARIES" &&
      p.layer !== "ROAD_CENTERLINES" &&
      p.layer !== "ROAD_BOUNDARIES",
  );

  // Helper to place cable text annotation along the longest segment of a polyline
  const addCableLabel = (cableOutputPts: CadPoint[], defaultName: string) => {
    if (cableOutputPts.length < 2) return;
    let longestIdx = 0;
    let maxLen = 0;
    for (let i = 0; i < cableOutputPts.length - 1; i++) {
      const segLen = distance(cableOutputPts[i], cableOutputPts[i + 1]);
      if (segLen > maxLen) {
        maxLen = segLen;
        longestIdx = i;
      }
    }
    const p1 = cableOutputPts[longestIdx];
    const p2 = cableOutputPts[longestIdx + 1];
    const mid = {
      x: (p1.x + p2.x) / 2,
      y: (p1.y + p2.y) / 2,
      z: (p1.z + p2.z) / 2,
    };
    const angleRad = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    let angleDeg = (angleRad * 180) / Math.PI;
    if (angleDeg > 90) angleDeg -= 180;
    else if (angleDeg < -90) angleDeg += 180;

    const normalRad = angleRad + Math.PI / 2;
    const offset = usesRawCoordinates ? 0.000018 : 1.4;
    const labelPos = {
      x: mid.x + Math.cos(normalRad) * offset,
      y: mid.y + Math.sin(normalRad) * offset,
      z: mid.z,
    };

    let labelText = defaultName.trim();
    if (!labelText || /^untitled/i.test(labelText)) {
      labelText = standard.focFiberCount || "12F";
    }
    if (/^\d+\s*F/i.test(labelText)) {
      labelText = `PROP. ${labelText.replace(/\s+/g, "")}OC`;
    } else if (!/^PROP\./i.test(labelText)) {
      labelText = `PROP. ${labelText}`;
    }
    entities.push(
      entityText(
        focLayer,
        labelText,
        labelPos,
        textHeight,
        angleDeg,
        1,
        Math.max(textHeight * 10, 8),
        focColor,
        textStyle,
      ),
    );
  };

  // 1. Process explicit cable lines from KMZ and refine them so the cable has a vertex to each pole/NAP on the road
  const coveredNapIds = new Set<string>();
  const allKeyPoints = [...naps, ...sources, ...poles];

  explicitLines.forEach((line) => {
    const coords = line.geometry.coordinates;
    if (coords.length < 2) return;
    const rawMetricPts = coords.map(projectMetric);

    // Topological Snapping for line endpoints: snap to nearest NAP or Source if within 25m
    const snapPoint = (metricPt: CadPoint, originalCoord: LonLat): { metric: CadPoint; out: CadPoint; coord: LonLat } => {
      let bestDist = 25.0;
      let snappedMetric = metricPt;
      let snappedCoord = originalCoord;
      allKeyPoints.forEach((kp) => {
        const kpMetric = projectMetric(kp.geometry.coordinates);
        const d = distance(metricPt, kpMetric);
        if (d < bestDist) {
          bestDist = d;
          snappedMetric = kpMetric;
          snappedCoord = kp.geometry.coordinates;
          coveredNapIds.add(kp.id);
        }
      });
      return { metric: snappedMetric, out: metricToOutput(snappedMetric), coord: snappedCoord };
    };

    // Refine the line by inserting vertices for every NAP / Source along the corridor
    const refinedMetric: CadPoint[] = [];
    const refinedOut: CadPoint[] = [];
    const refinedCoords: LonLat[] = [];

    const startSnap = snapPoint(rawMetricPts[0], coords[0]);
    refinedMetric.push(startSnap.metric);
    refinedOut.push(startSnap.out);
    refinedCoords.push(startSnap.coord);

    for (let i = 0; i < rawMetricPts.length - 1; i++) {
      const p1 = rawMetricPts[i];
      const p2 = rawMetricPts[i + 1];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const lenSq = dx * dx + dy * dy;
      if (lenSq < 0.2) continue;

      // Find any NAPs or Sources along this segment [p1, p2]
      const onSegment: { t: number; metricPt: CadPoint; outPt: CadPoint; coord: LonLat }[] = [];
      allKeyPoints.forEach((kp) => {
        const kpMetric = projectMetric(kp.geometry.coordinates);
        const t = ((kpMetric.x - p1.x) * dx + (kpMetric.y - p1.y) * dy) / lenSq;
        if (t >= -0.05 && t <= 1.05) {
          const projX = p1.x + t * dx;
          const projY = p1.y + t * dy;
          const dist = Math.hypot(kpMetric.x - projX, kpMetric.y - projY);
          if (dist <= 25.0) {
            coveredNapIds.add(kp.id);
            if (t > 0.05 && t < 0.95) {
              const projMetric = { x: projX, y: projY, z: 0 };
              const projOut = metricToOutput(projMetric);
              const projCoord = utmToLonLat(projMetric, utmZone(coords[0].lon), coords[0].lat >= 0);
              onSegment.push({ t, metricPt: projMetric, outPt: projOut, coord: projCoord });
            }
          }
        }
      });

      onSegment.sort((a, b) => a.t - b.t);
      for (const item of onSegment) {
        refinedMetric.push(item.metricPt);
        refinedOut.push(item.outPt);
        refinedCoords.push(item.coord);
      }

      if (i === rawMetricPts.length - 2) {
        const endSnap = snapPoint(p2, coords[coords.length - 1]);
        refinedMetric.push(endSnap.metric);
        refinedOut.push(endSnap.out);
        refinedCoords.push(endSnap.coord);
      } else {
        refinedMetric.push(p2);
        refinedOut.push(metricToOutput(p2));
        refinedCoords.push(coords[i + 1]);
      }
    }

    entities.push(entityPolyline(focLayer, refinedOut, false));
    points.push(...refinedOut);
    generatedLines.push({ name: line.name || standard.focFiberCount || "12F", coordinates: refinedCoords });

    const lineName = line.name || standard.focFiberCount || "12F";
    addCableLabel(refinedOut, lineName);
  });

  // 2. Auto-generate FOC cables ONLY if no explicit lines exist in the KMZ
  const shouldAutoGenerate = standard.autoGenerateFocCable !== false;

  if (shouldAutoGenerate && explicitLines.length === 0 && naps.length > 0) {
    const napsToConnect = naps;

    // Group NAPs by Loop identifier (e.g. _L901_, _L902_, _L914_) or feeder code (C01, C02)
    const groups = new Map<string, typeof naps>();
    napsToConnect.forEach((nap) => {
      const searchStr = `${nap.name} ${nap.napId} ${nap.feederRef || ""}`;
      const loopMatch = searchStr.match(/_?(L\d+)_?/i);
      const cableMatch = searchStr.match(/_?(C\d+)_?/i);
      const groupId = loopMatch ? loopMatch[1].toUpperCase() : cableMatch ? cableMatch[1].toUpperCase() : "MAIN_LOOP";
      if (!groups.has(groupId)) groups.set(groupId, []);
      groups.get(groupId)!.push(nap);
    });

    groups.forEach((groupNaps, groupId) => {
      if (groupNaps.length === 0) return;

      // Find best anchor source for this loop group
      let anchorPt: LonLat | null = null;
      let minAnchorDist = Infinity;

      // Check if any source matches this loop
      const groupSource = sources.find(
        (s) => s.name.toUpperCase().includes(groupId) || (s.napId && s.napId.toUpperCase().includes(groupId)),
      );
      if (groupSource) {
        anchorPt = groupSource.geometry.coordinates;
      } else if (sources.length > 0) {
        // Nearest site source (e.g. 72F CLOSURE) to the first NAP
        const refNapMetric = projectMetric(groupNaps[0].geometry.coordinates);
        sources.forEach((s) => {
          const sMetric = projectMetric(s.geometry.coordinates);
          const d = distance(refNapMetric, sMetric);
          if (d < minAnchorDist) {
            minAnchorDist = d;
            anchorPt = s.geometry.coordinates;
          }
        });
      }

      // Sort NAPs inside loop by sequence: N01, N02, N03... or Dummy D01, D02...
      const parseSeq = (name: string) => {
        const m = name.match(/[ND](\d+)/i);
        return m ? Number(m[1]) : 999;
      };

      const sorted = [...groupNaps].sort((a, b) => {
        const seqA = parseSeq(a.name);
        const seqB = parseSeq(b.name);
        if (seqA !== seqB) return seqA - seqB;
        if (anchorPt) {
          const dA = distance(projectMetric(a.geometry.coordinates), projectMetric(anchorPt));
          const dB = distance(projectMetric(b.geometry.coordinates), projectMetric(anchorPt));
          return dA - dB;
        }
        return 0;
      });

      // Construct route chain
      const chainCoords: LonLat[] = [];
      if (anchorPt) {
        chainCoords.push(anchorPt);
      }
      sorted.forEach((nap) => chainCoords.push(nap.geometry.coordinates));

      if (chainCoords.length >= 2) {
        const chainOutPts = chainCoords.map(projectOutput);
        entities.push(entityPolyline(focLayer, chainOutPts, false));
        points.push(...chainOutPts);
        generatedLines.push({ name: `PROP. ${standard.focFiberCount || "12F"}`, coordinates: chainCoords });

        // Add PROP. 12FOC label
        addCableLabel(chainOutPts, standard.focFiberCount || "12F");
      }
    });

    // 3. Feeder cable between OLT and Closure if both exist and not connected
    const oltSource = sources.find((s) => /olt|TCIS|MIN\d+/i.test(s.name) && !/closure/i.test(s.name));
    const closureSource = sources.find((s) => /closure/i.test(s.name));
    if (oltSource && closureSource) {
      const p1Out = projectOutput(oltSource.geometry.coordinates);
      const p2Out = projectOutput(closureSource.geometry.coordinates);
      const feederOutPts = [p1Out, p2Out];
      entities.push(entityPolyline(focLayer, feederOutPts, false));
      points.push(...feederOutPts);
      addCableLabel(feederOutPts, "72F");
    }
  }

  return { entities, points, generatedLines };
}

function createHldNapDxf(
  placemarks: ClassifiedNapPlacemark[],
  center: LonLat,
  sourceName: string,
  standard: HldNapStandard = defaultHldNapStandard,
  coordinateMode: CoordinateMode = "mercator",
  textStyle = "STANDARD",
) {
  resetDxfHandles();
  const zone = utmZone(center.lon);
  const projectMetric = (point: LonLat) => lonLatToUtm(point, zone);
  const usesRawCoordinates =
    coordinateMode === "epsg_4326_lat_lon" ||
    coordinateMode === "epsg_4326_lon_lat" ||
    coordinateMode === "raw_lat_lon" ||
    coordinateMode === "raw_lon_lat";
  const projectRaw =
    coordinateMode === "epsg_4326_lat_lon" || coordinateMode === "raw_lat_lon"
      ? latLonToRawCad
      : lonLatToRawCad;
  const projectOutput = usesRawCoordinates
    ? projectRaw
    : coordinateMode === "epsg_3857"
      ? lonLatToPseudoMercator
      : coordinateMode === "mercator"
        ? lonLatToWgs84Mercator
        : projectMetric;
  const metricToOutput = usesRawCoordinates
    ? (point: CadPoint) => projectRaw(utmToLonLat(point, zone, center.lat >= 0))
    : coordinateMode === "epsg_3857"
      ? (point: CadPoint) => lonLatToPseudoMercator(utmToLonLat(point, zone, center.lat >= 0))
      : coordinateMode === "mercator"
        ? (point: CadPoint) => lonLatToWgs84Mercator(utmToLonLat(point, zone, center.lat >= 0))
        : (point: CadPoint) => point;

  const entities: string[] = [];
  const allCadPoints: CadPoint[] = [];

  // 1. Process Placemarks (NAPs and Sources)
  placemarks.forEach((placemark) => {
    if (placemark.geometry.type === "Point") {
      // Exclude Cluster Boundaries completely (Cluster ID removed as requested)
      if (placemark.layer === "CLUSTER_BOUNDARIES") {
        return;
      }

      const cadPoint = projectOutput(placemark.geometry.coordinates);
      allCadPoints.push(cadPoint);

      if (placemark.layer === "OLT_POI") {
        const textHeight = usesRawCoordinates ? 0.00002 : standard.labelHeight;
        entities.push(
          entityText(
            "OLT_POI",
            sanitizeDxfText(placemark.name),
            cadPoint,
            textHeight,
            0,
            1,
            Math.max(textHeight * 12, 8),
            4,
            textStyle,
          ),
        );
        return;
      }

      if (isPolePlacemark(placemark)) {
        entities.push(...poleMarkerEntities(cadPoint, defaultPoleStandard));
        const poleLabel = renderPoleLabel(placemark, defaultPoleStandard);
        if (poleLabel) {
          entities.push(
            entityMultilineText(
              "POLE_LABELS",
              poleLabel,
              { x: cadPoint.x + (usesRawCoordinates ? 0.000015 : 1.2), y: cadPoint.y + (usesRawCoordinates ? 0.000015 : 1.2), z: cadPoint.z },
              usesRawCoordinates ? 0.000015 : 1.2,
              0,
              undefined,
              textStyle,
            ),
          );
        }
        return;
      }

      // NAP Block Insert with Attributes
      entities.push(...entityNapBlockInsertWithAttributes(placemark, cadPoint, standard, usesRawCoordinates));
      return;
    }

    if (placemark.geometry.type === "Polygon") {
      // Exclude Cluster Polygon completely (Cluster polygon removed as requested)
      if (placemark.layer === "CLUSTER_BOUNDARIES") {
        return;
      }
      placemark.geometry.coordinates.forEach((ring) => {
        const points = ring.map(projectOutput);
        allCadPoints.push(...points);
        entities.push(entityPolyline(placemark.layer, points, true));
      });
    }
  });

  // 2. Generate and Route FOC Cables (no measurement spans, official P-AERIAL_FOC layer)
  const cableRes = buildHldFocCables(
    placemarks,
    projectMetric,
    projectOutput,
    metricToOutput,
    usesRawCoordinates,
    standard,
    textStyle,
  );
  entities.push(...cableRes.entities);
  allCadPoints.push(...cableRes.points);

  // Notes Title Block
  const noteAnchor = allCadPoints.length
    ? {
        x: Math.min(...allCadPoints.map((p) => p.x)),
        y: Math.max(...allCadPoints.map((p) => p.y)) + (usesRawCoordinates ? 0.0005 : 35),
        z: 0,
      }
    : { x: 0, y: 0, z: 0 };
  const noteTextHeight = usesRawCoordinates ? 0.00002 : Math.max(standard.labelHeight * 1.2, 2.0);
  const noteLineGap = noteTextHeight * 2.2;

  entities.push(
    entityText(
      "FTTH_NOTES",
      `FTTH HLD NAP DESIGN: ${sourceName.toUpperCase()}`,
      noteAnchor,
      noteTextHeight * 1.5,
      0,
      1,
      Math.max(noteTextHeight * 16, 12),
      3,
      textStyle,
    ),
  );
  entities.push(
    entityText(
      "FTTH_NOTES",
      `Provider: ${standard.telcoProvider.toUpperCase()} • Stencil Style: ${standard.stencilStyle} • Default Splitter: ${standard.defaultSplitter}`,
      { ...noteAnchor, y: noteAnchor.y - noteLineGap },
      noteTextHeight,
      0,
      1,
      Math.max(noteTextHeight * 12, 8),
      undefined,
      textStyle,
    ),
  );
  entities.push(
    entityText(
      "FTTH_NOTES",
      `Aerial FOC Cable: ${standard.telcoProvider === "pldt" ? "CABLE_ROUTES" : "P-AERIAL_FOC (Color 1 Red)"} • Auto-routed along Loops & Closures`,
      { ...noteAnchor, y: noteAnchor.y - noteLineGap * 2 },
      noteTextHeight,
      0,
      1,
      Math.max(noteTextHeight * 12, 8),
      undefined,
      textStyle,
    ),
  );
  entities.push(
    entityText(
      "FTTH_NOTES",
      "© 2026 Caesar Ian Samulde. All Rights Reserved. Reverse engineering, resale, and unauthorized copying are strictly prohibited.",
      { ...noteAnchor, y: noteAnchor.y - noteLineGap * 3 },
      noteTextHeight,
      0,
      1,
      Math.max(noteTextHeight * 12, 8),
      undefined,
      textStyle,
    ),
  );

  const extentPadding = usesRawCoordinates ? 0.0002 : 20;
  const extents = allCadPoints.length
    ? {
        minX: Math.min(...allCadPoints.map((point) => point.x)) - extentPadding,
        minY: Math.min(...allCadPoints.map((point) => point.y)) - extentPadding,
        maxX: Math.max(...allCadPoints.map((point) => point.x)) + extentPadding,
        maxY: Math.max(...allCadPoints.map((point) => point.y)) + extentPadding,
      }
    : { minX: 0, minY: 0, maxX: 100, maxY: 100 };

  const namedObjectDictionaryHandle = dxfHandle();
  const groupDictionaryHandle = dxfHandle();
  const plotStyleDictionaryHandle = dxfHandle();
  const plotStyleNormalHandle = dxfHandle();
  const geodataHandle =
    coordinateMode === "epsg_3857" || coordinateMode === "mercator"
      ? dxfHandle()
      : null;
  const modelSpaceBlockRecordHandle = dxfHandle();
  const modelSpaceXDictHandle = geodataHandle ? dxfHandle() : null;

  const distinctLayers = new Set<string>(Object.keys(layerMeta));
  for (const p of placemarks) {
    if (p.layer) distinctLayers.add(p.layer);
  }
  const dxfLayerEntries: Array<[string, { color: number }]> = Array.from(distinctLayers).map((l) => [
    l,
    { color: l === "ROAD_LABELS" ? (isPldtProvider(standard.telcoProvider) ? 5 : 2) : getLayerColor(l) },
  ]);
  const layers = dxfLayerEntries.flatMap(([layer, meta]) => [
    dxfPair(0, "LAYER"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbSymbolTableRecord"),
    dxfPair(100, "AcDbLayerTableRecord"),
    dxfPair(2, layer),
    dxfPair(70, 0),
    dxfPair(62, meta.color),
    dxfPair(6, "CONTINUOUS"),
    dxfPair(370, -3),
    dxfPair(390, plotStyleNormalHandle),
  ]);

  const emptySymbolTable = (name: string) => [
    dxfPair(0, "TABLE"),
    dxfPair(2, name),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbSymbolTable"),
    ...(name === "DIMSTYLE" ? [dxfPair(100, "AcDbDimStyleTable")] : []),
    dxfPair(70, 0),
    dxfPair(0, "ENDTAB"),
  ];

  const textStyles = [
    ["STANDARD", "arial.ttf", ""],
    ["样式 1", "SimSun.ttf", ""],
    ["SIMPLEX", "simplex.shx", ""],
    ["ROMANS", "romans.shx", ""],
    ["CGOMEGA", "simplex.shx", ""],
    ["BOLD", "swisscbo.ttf", ""],
    ["Annotative", "arial.ttf", ""],
  ];
  const textStyleTable = [
    dxfPair(0, "TABLE"),
    dxfPair(2, "STYLE"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbSymbolTable"),
    dxfPair(70, textStyles.length),
    ...textStyles.flatMap(([name, font, bigFont]) => [
      dxfPair(0, "STYLE"),
      dxfPair(5, dxfHandle()),
      dxfPair(100, "AcDbSymbolTableRecord"),
      dxfPair(100, "AcDbTextStyleTableRecord"),
      dxfPair(2, name),
      dxfPair(70, 0),
      dxfPair(40, 0),
      dxfPair(41, 1),
      dxfPair(50, 0),
      dxfPair(71, 0),
      dxfPair(42, 0),
      dxfPair(3, font),
      dxfPair(4, bigFont),
    ]),
    dxfPair(0, "ENDTAB"),
  ];

  const linetypesTable = [
    dxfPair(0, "TABLE"),
    dxfPair(2, "LTYPE"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbSymbolTable"),
    dxfPair(70, 3),
    ...[
      ["BYBLOCK", ""],
      ["BYLAYER", ""],
      ["CONTINUOUS", "Solid line"],
    ].flatMap(([name, description]) => [
      dxfPair(0, "LTYPE"),
      dxfPair(5, dxfHandle()),
      dxfPair(100, "AcDbSymbolTableRecord"),
      dxfPair(100, "AcDbLinetypeTableRecord"),
      dxfPair(2, name),
      dxfPair(70, 0),
      dxfPair(3, description),
      dxfPair(72, 65),
      dxfPair(73, 0),
      dxfPair(40, 0),
    ]),
    dxfPair(0, "ENDTAB"),
  ];

  const hldBlockNames = [
    "*PAPER_SPACE",
    "GLOBE NAP PROPOSED",
    "GLOBE NAP EXISTING",
    "GLOBE NAP 8-LINES",
    "GLOBE NAP 8-LINES EXISTING",
    "SINGLE NAP 2",
    "GLOBE NAP DUMMY",
    "GLOBE NAP DUMMY EXISTING",
    "Dummy NAP",
    "NAP_GLOBE_STENCIL",
    "NEW_PLDT_NAP_SYMBOL",
    "NAP_8PORT",
    "NAP_16PORT",
    "NAP_SPLITTER",
  ];

  const blockRecordTable = [
    dxfPair(0, "TABLE"),
    dxfPair(2, "BLOCK_RECORD"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbSymbolTable"),
    dxfPair(70, 1 + hldBlockNames.length),
    dxfPair(0, "BLOCK_RECORD"),
    dxfPair(5, modelSpaceBlockRecordHandle),
    ...(modelSpaceXDictHandle
      ? [
          dxfPair(102, "{ACAD_XDICTIONARY"),
          dxfPair(360, modelSpaceXDictHandle),
          dxfPair(102, "}"),
        ]
      : []),
    dxfPair(100, "AcDbSymbolTableRecord"),
    dxfPair(100, "AcDbBlockTableRecord"),
    dxfPair(2, "*MODEL_SPACE"),
    ...hldBlockNames.flatMap((name) => [
      dxfPair(0, "BLOCK_RECORD"),
      dxfPair(5, dxfHandle()),
      dxfPair(100, "AcDbSymbolTableRecord"),
      dxfPair(100, "AcDbBlockTableRecord"),
      dxfPair(2, name),
    ]),
    dxfPair(0, "ENDTAB"),
  ];

  const appIdTable = [
    dxfPair(0, "TABLE"),
    dxfPair(2, "APPID"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbSymbolTable"),
    dxfPair(70, 2),
    ...["ACAD", "AcadAnnotative"].flatMap((name) => [
      dxfPair(0, "APPID"),
      dxfPair(5, dxfHandle()),
      dxfPair(100, "AcDbSymbolTableRecord"),
      dxfPair(100, "AcDbRegAppTableRecord"),
      dxfPair(2, name),
      dxfPair(70, 0),
    ]),
    dxfPair(0, "ENDTAB"),
  ];

  const layerTable = [
    dxfPair(0, "TABLE"),
    dxfPair(2, "LAYER"),
    dxfPair(5, dxfHandle()),
    dxfPair(100, "AcDbSymbolTable"),
    dxfPair(70, dxfLayerEntries.length),
    ...layers,
    dxfPair(0, "ENDTAB"),
  ];

  const vportTable = emptySymbolTable("VPORT");
  const viewTable = emptySymbolTable("VIEW");
  const ucsTable = emptySymbolTable("UCS");
  const dimStyleTable = emptySymbolTable("DIMSTYLE");
  const modelSpace = emptyBlockDefinition("*MODEL_SPACE");
  const paperSpace = emptyBlockDefinition("*PAPER_SPACE");

  const napBlocks = [
    globeNapProposedBlockDefinition(),
    globeNapExistingBlockDefinition("GLOBE NAP EXISTING"),
    globeNap8LinesBlockDefinition("GLOBE NAP 8-LINES"),
    globeNap8LinesExistingBlockDefinition("GLOBE NAP 8-LINES EXISTING"),
    globeNap8LinesBlockDefinition("SINGLE NAP 2"),
    globeNapDummyBlockDefinition("GLOBE NAP DUMMY"),
    globeNapDummyExistingBlockDefinition("GLOBE NAP DUMMY EXISTING"),
    globeNapDummyBlockDefinition("Dummy NAP"),
    napGlobeBlockDefinition(),
    newPldtNapSymbolBlockDefinition(),
    napBox8pBlockDefinition(),
    napHex16pBlockDefinition(),
    napSplitterBlockDefinition(),
  ];

  const activeCsXml =
    coordinateMode === "mercator" ? WORLD_MERCATOR_CS_XML : PSEUDO_MERCATOR_CS_XML;
  const escapedXml = activeCsXml.replace(/\r\n/g, "^J").replace(/\n/g, "^J");
  const geodataXmlChunks = splitDxfStringChunks(escapedXml);
  const geodataXmlPairs = geodataXmlChunks.flatMap((chunk, idx) => [
    dxfPair(idx === geodataXmlChunks.length - 1 ? 301 : 303, chunk),
  ]);

  const classesSection = [
    dxfPair(0, "SECTION"),
    dxfPair(2, "CLASSES"),
    dxfPair(0, "CLASS"),
    dxfPair(1, "GEODATA"),
    dxfPair(2, "AcDbGeoData"),
    dxfPair(3, "ObjectDBX Classes"),
    dxfPair(90, 4095),
    dxfPair(91, 0),
    dxfPair(280, 0),
    dxfPair(281, 0),
    dxfPair(0, "ENDSEC"),
  ];

  const objectsSection = [
    dxfPair(0, "DICTIONARY"),
    dxfPair(5, namedObjectDictionaryHandle),
    dxfPair(100, "AcDbDictionary"),
    dxfPair(281, 1),
    dxfPair(3, "ACAD_GROUP"),
    dxfPair(350, groupDictionaryHandle),
    dxfPair(3, "ACAD_PLOTSTYLENAME"),
    dxfPair(350, plotStyleDictionaryHandle),
    dxfPair(0, "DICTIONARY"),
    dxfPair(5, groupDictionaryHandle),
    dxfPair(100, "AcDbDictionary"),
    dxfPair(281, 1),
    dxfPair(0, "ACDBDICTIONARYWDFLT"),
    dxfPair(5, plotStyleDictionaryHandle),
    dxfPair(330, namedObjectDictionaryHandle),
    dxfPair(100, "AcDbDictionary"),
    dxfPair(281, 1),
    dxfPair(3, "Normal"),
    dxfPair(350, plotStyleNormalHandle),
    dxfPair(100, "AcDbDictionaryWithDefault"),
    dxfPair(340, plotStyleNormalHandle),
    dxfPair(0, "ACDBPLACEHOLDER"),
    dxfPair(5, plotStyleNormalHandle),
    dxfPair(330, plotStyleDictionaryHandle),
    ...(geodataHandle && modelSpaceXDictHandle
      ? [
          dxfPair(0, "DICTIONARY"),
          dxfPair(5, modelSpaceXDictHandle),
          dxfPair(330, modelSpaceBlockRecordHandle),
          dxfPair(100, "AcDbDictionary"),
          dxfPair(281, 1),
          dxfPair(3, "ACAD_GEOGRAPHICDATA"),
          dxfPair(350, geodataHandle),
          dxfPair(0, "GEODATA"),
          dxfPair(5, geodataHandle),
          dxfPair(102, "{ACAD_REACTORS"),
          dxfPair(330, modelSpaceXDictHandle),
          dxfPair(102, "}"),
          dxfPair(330, modelSpaceXDictHandle),
          dxfPair(100, "AcDbGeoData"),
          dxfPair(90, 2),
          dxfPair(330, 0),
          dxfPair(70, 3),
          dxfPair(10, cadCoord(projectOutput(center).x)),
          dxfPair(20, cadCoord(projectOutput(center).y)),
          dxfPair(30, "0.0"),
          dxfPair(11, center.lon.toFixed(8)),
          dxfPair(21, center.lat.toFixed(8)),
          dxfPair(31, "0.0"),
          dxfPair(40, "1.0"),
          dxfPair(91, 6),
          dxfPair(41, "1.0"),
          dxfPair(92, 6),
          dxfPair(210, "0.0"),
          dxfPair(220, "0.0"),
          dxfPair(230, "1.0"),
          dxfPair(12, "0.0"),
          dxfPair(22, "1.0"),
          dxfPair(95, 1),
          dxfPair(141, "1.0"),
          dxfPair(294, 0),
          dxfPair(142, "0.0"),
          dxfPair(143, "0.0"),
          ...geodataXmlPairs,
          dxfPair(93, 0),
          dxfPair(96, 0),
        ]
      : []),
  ];

  const handseed = (dxfHandleCounter + 100).toString(16).toUpperCase();

  const dxf = [
    dxfPair(999, "================================================================================"),
    dxfPair(999, "FTTH HLD NAP & Stencil Automated Conversion Suite"),
    dxfPair(999, "Copyright (c) 2026 Caesar Ian Samulde. All Rights Reserved."),
    dxfPair(999, "================================================================================"),
    dxfPair(0, "SECTION"),
    dxfPair(2, "HEADER"),
    dxfPair(9, "$ACADVER"),
    dxfPair(1, "AC1024"),
    dxfPair(9, "$HANDSEED"),
    dxfPair(5, handseed),
    dxfPair(9, "$INSUNITS"),
    dxfPair(70, usesRawCoordinates ? 0 : 6),
    dxfPair(9, "$LUNITS"),
    dxfPair(70, 2),
    dxfPair(9, "$LUPREC"),
    dxfPair(70, 4),
    dxfPair(9, "$AUNITS"),
    dxfPair(70, 0),
    dxfPair(9, "$AUPREC"),
    dxfPair(70, 4),
    dxfPair(9, "$EXTMIN"),
    dxfPair(10, extents.minX),
    dxfPair(20, extents.minY),
    dxfPair(30, 0),
    dxfPair(9, "$EXTMAX"),
    dxfPair(10, extents.maxX),
    dxfPair(20, extents.maxY),
    dxfPair(30, 0),
    dxfPair(0, "ENDSEC"),
    ...classesSection,
    dxfPair(0, "SECTION"),
    dxfPair(2, "TABLES"),
    ...vportTable,
    ...linetypesTable,
    ...layerTable,
    ...textStyleTable,
    ...viewTable,
    ...ucsTable,
    ...appIdTable,
    ...dimStyleTable,
    ...blockRecordTable,
    dxfPair(0, "ENDSEC"),
    dxfPair(0, "SECTION"),
    dxfPair(2, "BLOCKS"),
    modelSpace,
    paperSpace,
    ...napBlocks,
    dxfPair(0, "ENDSEC"),
    dxfPair(0, "SECTION"),
    dxfPair(2, "ENTITIES"),
    ...entities,
    dxfPair(0, "ENDSEC"),
    dxfPair(0, "SECTION"),
    dxfPair(2, "OBJECTS"),
    ...objectsSection,
    dxfPair(0, "ENDSEC"),
    dxfPair(0, "EOF"),
    "",
  ].join("\n");

  return { dxf, zone };
}

function rawNapCsv(
  naps: ClassifiedNapPlacemark[],
  center: LonLat,
  zone: number,
  coordinateMode: CoordinateMode,
): string {
  const headers = [
    "NAP ID",
    "AutoCAD Layer",
    "Splitter Ratio",
    "Port Capacity",
    "NAP Status",
    "Associated Pole",
    "Feeder Route",
    "Latitude",
    "Longitude",
    "CAD X (Easting)",
    "CAD Y (Northing)",
  ];

  const rows = [headers.join(",")];

  naps.forEach((nap) => {
    if (nap.geometry.type !== "Point") return;
    const pt = nap.geometry.coordinates;
    const cad =
      coordinateMode === "mercator"
        ? lonLatToWgs84Mercator(pt)
        : coordinateMode === "epsg_3857"
          ? lonLatToPseudoMercator(pt)
          : coordinateMode === "utm"
            ? lonLatToUtm(pt, zone)
            : { x: pt.lon, y: pt.lat, z: 0 };

    const statusLabel = nap.status === "EXISTING" ? (nap.isDummy ? "EXISTING DUMMY" : "SOURCE EXISTING NAP") : nap.status;
    const splitterLabel = nap.isDummy ? "Dummy NAP" : nap.splitter;

    rows.push(
      [
        `"${nap.napId}"`,
        `"${nap.layer}"`,
        `"${splitterLabel}"`,
        `${nap.ports}P`,
        `"${statusLabel}"`,
        `"${nap.poleRef || "-"}"`,
        `"${nap.feederRef || "-"}"`,
        pt.lat.toFixed(6),
        pt.lon.toFixed(6),
        cad.x.toFixed(2),
        cad.y.toFixed(2),
      ].join(","),
    );
  });

  return rows.join("\r\n");
}

function hldNapPreviewHtml(source: HldConvertResult, standard: HldNapStandard) {
  const placemarks = source.placemarks;
  const coords = collectCoordinates(placemarks);
  const naps = placemarks.filter((p) => p.geometry.type === "Point" && p.layer !== "CLUSTER_BOUNDARIES" && p.layer !== "OLT_POI");
  const otherLines = placemarks.filter(
    (p) =>
      p.geometry.type === "LineString" &&
      p.layer !== "FEEDER_CABLES" &&
      p.layer !== "CABLE_ROUTES" &&
      p.layer !== "SPAN" &&
      p.layer !== "CLUSTER_BOUNDARIES",
  );

  const centerLon = coords.length ? coords.reduce((sum, p) => sum + p.lon, 0) / coords.length : source.center.lon;
  const centerLat = coords.length ? coords.reduce((sum, p) => sum + p.lat, 0) / coords.length : source.center.lat;

  const zone = utmZone(centerLon);
  const projectMetric = (p: LonLat) => lonLatToUtm(p, zone);
  const cableRes = buildHldFocCables(
    placemarks,
    projectMetric,
    projectMetric,
    (p) => p,
    false,
    standard,
    "STANDARD",
  );

  const payload = {
    center: [centerLat, centerLon],
    bounds: coords.map((p) => [p.lat, p.lon]),
    naps: naps.map((nap) => {
      const pt = nap.geometry.type === "Point" ? nap.geometry.coordinates : { lon: 0, lat: 0 };
      return {
        id: nap.napId,
        status: nap.status,
        isDummy: Boolean(nap.isDummy),
        splitter: nap.splitter,
        ports: nap.ports,
        poleRef: nap.poleRef,
        feederRef: nap.feederRef,
        lat: pt.lat,
        lon: pt.lon,
      };
    }),
    feeders: cableRes.generatedLines.map((line) => ({
      name: line.name,
      coordinates: line.coordinates.map((p) => [p.lat, p.lon]),
    })),
    otherLines: otherLines.map((line) => ({
      name: line.name,
      coordinates: (line.geometry as Extract<Geometry, { type: "LineString" }>).coordinates.map((p) => [p.lat, p.lon]),
    })),
    standard: {
      provider: standard.telcoProvider,
      stencilStyle: standard.stencilStyle,
    },
  };

  const serializedPayload = JSON.stringify(payload).replace(/</g, "\\u003c");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>FTTH HLD NAP Interactive Map Preview • ${escapeHtml(source.fileName)}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; }
    header {
      position: absolute; top: 12px; left: 12px; right: 12px; z-index: 1000;
      background: rgba(15, 23, 42, 0.92); color: #f8fafc; padding: 12px 16px;
      border-radius: 10px; border: 1px solid rgba(255, 255, 255, 0.15);
      backdrop-filter: blur(8px); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;
    }
    header h1 { margin: 0; font-size: 16px; font-weight: 700; color: #38bdf8; }
    .legend { display: flex; gap: 12px; font-size: 12px; align-items: center; flex-wrap: wrap; }
    .legend span { display: flex; align-items: center; gap: 5px; }
    .legend i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; }
    .nap-tooltip {
      font-size: 12px; line-height: 1.4;
    }
    .nap-tooltip strong { color: #0284c7; }
    .leaflet-popup-content-wrapper {
      background: #1e293b; color: #f8fafc; border: 1px solid #475569; border-radius: 8px;
    }
    .leaflet-popup-tip { background: #1e293b; }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>🌐 FTTH HLD NAP Preview — ${escapeHtml(source.fileName)}</h1>
      <small style="color: #94a3b8">Standard: ${standard.telcoProvider.toUpperCase()} • Stencil: ${standard.stencilStyle} • ${naps.length} NAPs Classified</small>
    </div>
    <div class="legend">
      <span><i style="background:#ef4444;border-radius:50%"></i> Proposed NAP</span>
      <span><i style="background:#2563eb;border-radius:50%"></i> Source Existing NAP</span>
      <span><i style="background:#2563eb;border:1.5px dashed #93c5fd;border-radius:3px"></i> Existing Dummy (C0X_D0X)</span>
      <span><i style="background:#06b6d4;border-radius:50%"></i> Vetted NAP</span>
      <span><i style="background:#64748b;border-radius:50%"></i> Source / FDH</span>
      <span><i style="background:#f59e0b;border-radius:50%"></i> Dummy NAP</span>
      <span><i style="background:#ef4444;height:3px;width:16px;border-radius:1px"></i> Aerial FOC Cable (P-AERIAL_FOC)</span>
    </div>
  </header>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const data = ${serializedPayload};
    const map = L.map("map", { preferCanvas: true }).setView(data.center, 18);
    
    // Base tile layers
    const osmLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 22, attribution: "&copy; OpenStreetMap"
    }).addTo(map);

    const satelliteLayer = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 20, attribution: "Tiles &copy; Esri"
    });

    const napsLayer = L.layerGroup().addTo(map);
    const feedersLayer = L.layerGroup().addTo(map);
    const otherLinesLayer = L.layerGroup().addTo(map);

    // Render NAPs
    data.naps.forEach((nap) => {
      const color = nap.status === "PROPOSED" ? "#ef4444" : nap.status === "EXISTING" ? "#2563eb" : nap.status === "VETTED" ? "#06b6d4" : nap.status === "SOURCE" ? "#64748b" : nap.status === "DUMMY" ? "#f59e0b" : "#94a3b8";

      // NAP Marker
      const isExistingDummy = nap.status === "EXISTING" && nap.isDummy;
      const marker = L.circleMarker([nap.lat, nap.lon], {
        radius: isExistingDummy ? 8 : 7,
        color: isExistingDummy ? "#93c5fd" : "#ffffff",
        weight: 2,
        fillColor: color,
        fillOpacity: 1
      }).addTo(napsLayer);

      const statusLabel = isExistingDummy ? "EXISTING DUMMY (Batch)" : nap.status === "EXISTING" ? "SOURCE EXISTING NAP" : nap.status;
      const splitterLabel = nap.isDummy ? "Dummy NAP (0 Ports)" : (nap.splitter + " (" + nap.ports + " Ports)");
      const popupContent = '<div class="nap-tooltip">' +
        '<b style="font-size:14px;color:' + color + '">' + nap.id + '</b>' +
        (isExistingDummy ? ' <span style="background:#2563eb;color:#fff;font-size:10px;padding:1px 4px;border-radius:3px">EXISTING DUMMY</span>' : '') + '<br>' +
        '<b>Status:</b> ' + statusLabel + '<br>' +
        '<b>Splitter:</b> ' + splitterLabel + '<br>' +
        '<b>Pole Ref:</b> ' + (nap.poleRef || 'None') + '<br>' +
        '<b>Feeder:</b> ' + (nap.feederRef || 'None') + '<br>' +
        '<b>Lat, Lon:</b> ' + nap.lat.toFixed(6) + ', ' + nap.lon.toFixed(6) +
        '</div>';

      marker.bindPopup(popupContent);
      marker.bindTooltip("<b>" + nap.id + "</b> (" + (nap.isDummy ? "Dummy" : nap.splitter) + ")", { permanent: false, direction: "top" });
    });

    // Render FOC Cable Lines
    const cableColor = data.standard.provider === "pldt" ? "#c026d3" : "#ef4444";
    data.feeders.forEach((feeder) => {
      L.polyline(feeder.coordinates, {
        color: cableColor,
        weight: 4,
        opacity: 0.95
      }).bindTooltip("<b>" + feeder.name + "</b> (Aerial FOC Cable)").addTo(feedersLayer);
    });

    // Render other lines
    data.otherLines.forEach((line) => {
      L.polyline(line.coordinates, {
        color: "#64748b",
        weight: 2,
        opacity: 0.7
      }).addTo(otherLinesLayer);
    });

    // Fit bounds
    if (data.bounds && data.bounds.length > 0) {
      map.fitBounds(data.bounds, { padding: [50, 50], maxZoom: 19 });
    }

    // Render other lines
    data.otherLines.forEach((line) => {
      L.polyline(line.coordinates, {
        color: "#64748b",
        weight: 2,
        opacity: 0.7
      }).addTo(otherLinesLayer);
    });

    // Fit bounds
    if (data.bounds && data.bounds.length > 0) {
      map.fitBounds(data.bounds, { padding: [50, 50], maxZoom: 19 });
    }

    // Layer Control
    L.control.layers(
      { "OpenStreetMap": osmLayer, "Satellite Imagery": satelliteLayer },
      {
        "🌐 NAPs": napsLayer,
        "⭕ 150m Drop Coverage": coverageLayer,
        "⚡ Feeder Cables": feedersLayer,
        ["📏 Spans (+" + (data.standard.spanAllowance || 2).toFixed(1) + "m)"]: spansLayer,
        "🛣️ Other Lines": otherLinesLayer
      },
      { collapsed: false }
    ).addTo(map);
  </script>
</body>
</html>`;
}

function getBoundingBox(placemarks: ClassifiedPlacemark[], paddingMeters = 300) {
  const coords = collectCoordinates(placemarks);
  if (!coords.length) return null;
  const minLat = Math.min(...coords.map((point) => point.lat));
  const maxLat = Math.max(...coords.map((point) => point.lat));
  const minLon = Math.min(...coords.map((point) => point.lon));
  const maxLon = Math.max(...coords.map((point) => point.lon));
  const centerLat = (minLat + maxLat) / 2;
  const latPad = paddingMeters / 111_320;
  const lonPad = paddingMeters / (111_320 * Math.max(Math.cos((centerLat * Math.PI) / 180), 0.15));

  return {
    south: minLat - latPad,
    west: minLon - lonPad,
    north: maxLat + latPad,
    east: maxLon + lonPad,
  };
}

async function fetchOpenStreetMapRoads(placemarks: ClassifiedPlacemark[], corridorThresholdMeters = 35) {
  const bbox = getBoundingBox(placemarks, 300);
  if (!bbox) throw new Error("Upload pole data before fetching roads.");

  const query = `
    [out:json][timeout:25];
    (
      way["highway"]["highway"!~"footway|path|steps|cycleway|bridleway|proposed|construction"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
    );
    out body;
    >;
    out skel qt;
  `;

  const response = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      "User-Agent": "FTTH-CAD-Converter/2.2 (contact@ftth.local)",
    },
    body: new URLSearchParams({ data: query }),
  });

  if (!response.ok) {
    throw new Error("OpenStreetMap road lookup failed. Try again later or import a survey/CAD road layer.");
  }

  const data = (await response.json()) as OverpassResponse;
  const nodes = new Map<number, LonLat>();
  data.elements.forEach((element) => {
    if (element.type === "node") nodes.set(element.id, { lon: element.lon, lat: element.lat });
  });

  // Calculate project center and metric projection for spatial corridor filtering
  const allCoords = collectCoordinates(placemarks);
  const center = calculateCenter(allCoords);
  const zone = utmZone(center.lon);
  const projectMetric = (point: LonLat) => lonLatToUtm(point, zone);

  // Extract pole coordinates in metric UTM
  const polePointsMetric: CadPoint[] = placemarks
    .filter((placemark) => placemark.geometry.type === "Point")
    .map((placemark) => projectMetric((placemark.geometry as Extract<Geometry, { type: "Point" }>).coordinates));

  // Extract aerial cable / span segments in metric UTM
  const cableSegmentsMetric: Array<{ start: CadPoint; end: CadPoint }> = [];
  placemarks
    .filter(
      (placemark) =>
        placemark.geometry.type === "LineString" &&
        (placemark.layer === "CABLE_ROUTES" ||
          placemark.layer === "SPAN" ||
          placemark.layer === "SOURCE_LINES" ||
          placemark.layer === "FEEDER_CABLES"),
    )
    .forEach((placemark) => {
      const lineCoords = (placemark.geometry as Extract<Geometry, { type: "LineString" }>).coordinates.map(projectMetric);
      for (let i = 0; i < lineCoords.length - 1; i += 1) {
        cableSegmentsMetric.push({ start: lineCoords[i], end: lineCoords[i + 1] });
      }
    });

  // If no explicit aerial cable lines exist, synthesize spans along ordered poles
  if (!cableSegmentsMetric.length && polePointsMetric.length > 1) {
    const ordered = orderedPolePath(polePointsMetric);
    for (let i = 0; i < ordered.length - 1; i += 1) {
      cableSegmentsMetric.push({ start: ordered[i], end: ordered[i + 1] });
    }
  }

  const wayElements = data.elements.filter(
    (element): element is Extract<OverpassElement, { type: "way" }> => element.type === "way",
  );

  const roadPlacemarks: ClassifiedPlacemark[] = [];

  wayElements.forEach((way) => {
    const coordinates = way.nodes.map((nodeId) => nodes.get(nodeId)).filter((point): point is LonLat => Boolean(point));
    if (coordinates.length < 2) return;
    const tags = way.tags || {};
    if (!tags.highway) return;

    const metricCoords = coordinates.map(projectMetric);

    // Test each segment of the road way against pole points and aerial cables
    const segValid: boolean[] = [];
    for (let i = 0; i < metricCoords.length - 1; i += 1) {
      const s = metricCoords[i];
      const e = metricCoords[i + 1];
      let minDistance = Infinity;

      for (let pIdx = 0; pIdx < polePointsMetric.length; pIdx += 1) {
        minDistance = Math.min(minDistance, segmentDistance(polePointsMetric[pIdx], s, e));
        if (minDistance <= corridorThresholdMeters) break;
      }

      if (minDistance > corridorThresholdMeters) {
        for (let cIdx = 0; cIdx < cableSegmentsMetric.length; cIdx += 1) {
          const seg = cableSegmentsMetric[cIdx];
          minDistance = Math.min(minDistance, segmentToSegmentDistance(s, e, seg.start, seg.end));
          if (minDistance <= corridorThresholdMeters) break;
        }
      }

      segValid.push(minDistance <= corridorThresholdMeters);
    }

    // Extract continuous runs of valid road segments
    const runs: LonLat[][] = [];
    let currentRun: LonLat[] = [];
    for (let i = 0; i < segValid.length; i += 1) {
      if (segValid[i]) {
        if (!currentRun.length) {
          currentRun.push(coordinates[i]);
        }
        currentRun.push(coordinates[i + 1]);
      } else {
        if (currentRun.length >= 2) {
          runs.push(currentRun);
        }
        currentRun = [];
      }
    }
    if (currentRun.length >= 2) {
      runs.push(currentRun);
    }

    if (!runs.length) return;

    const baseName =
      (
        tags.name ||
        tags["name:en"] ||
        tags.official_name ||
        tags.alt_name ||
        tags.loc_name ||
        tags.ref ||
        ""
      ).trim() || "BRGY ROAD";
    runs.forEach((runCoords, runIdx) => {
      // Filter out tiny isolated stubs (< 4 meters)
      const runMetric = runCoords.map(projectMetric);
      let runLen = 0;
      for (let i = 0; i < runMetric.length - 1; i += 1) {
        runLen += distance(runMetric[i], runMetric[i + 1]);
      }
      if (runLen < 4.0) return;

      const roadId = runs.length === 1 ? `${way.id}` : `${way.id}-${runIdx + 1}`;
      roadPlacemarks.push(createRoadPlacemark(roadId, baseName, tags.highway, runCoords, tags));
    });
  });

  return roadPlacemarks;
}

async function fetchOpenStreetMapResidentialContext(placemarks: ClassifiedPlacemark[]) {
  const bbox = getBoundingBox(placemarks, 300);
  if (!bbox) throw new Error("Upload pole data before previewing OSM demand areas.");

  const query = `
    [out:json][timeout:25];
    (
      way["building"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
      way["landuse"="residential"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
      way["landuse"="commercial"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
      way["landuse"="retail"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
      way["landuse"="industrial"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
      way["residential"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
      way["parcel"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
      way["boundary"="lot"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
      way["shop"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
      way["office"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
      way["amenity"~"school|college|university|hospital|clinic|place_of_worship|community_centre|public_building|townhall"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
    );
    out body;
    >;
    out skel qt;
  `;

  const response = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: new URLSearchParams({ data: query }),
  });

  if (!response.ok) {
    throw new Error("OpenStreetMap FTTH area preview lookup failed. Try again later.");
  }

  const data = (await response.json()) as OverpassResponse;
  const nodes = new Map<number, LonLat>();
  data.elements.forEach((element) => {
    if (element.type === "node") nodes.set(element.id, { lon: element.lon, lat: element.lat });
  });

  return data.elements
    .filter((element): element is Extract<OverpassElement, { type: "way" }> => element.type === "way")
    .map((way) => {
      const coordinates = way.nodes.map((nodeId) => nodes.get(nodeId)).filter((point): point is LonLat => Boolean(point));
      if (!isClosedWay(coordinates)) return null;
      const tags = way.tags || {};
      if (tags.building) {
        return createOsmPolygonPlacemark(way.id, tags.name || tags["addr:housenumber"] || `Building ${way.id}`, "BUILDING_FOOTPRINTS", coordinates, tags);
      }
      const layer = osmDemandLayer(tags);
      return createOsmPolygonPlacemark(way.id, tags.name || `${osmDemandLabel(layer)} ${way.id}`, layer, coordinates, tags);
    })
    .filter((placemark): placemark is ClassifiedPlacemark => placemark !== null);
}

async function readSourceFile(fileOrFiles: File | File[] | FileList) {
  const files: File[] =
    fileOrFiles instanceof File
      ? [fileOrFiles]
      : Array.from(fileOrFiles);

  if (files.length === 0) {
    throw new Error("Please upload a .kmz or .kml file.");
  }

  const allKmlTexts: Array<{ name: string; text: string }> = [];
  const validNames: string[] = [];

  for (const file of files) {
    validNames.push(file.name);
    const ext = file.name.toLowerCase().split(".").pop();
    if (ext === "kml") {
      allKmlTexts.push({ name: file.name, text: await file.text() });
      continue;
    }
    if (ext === "kmz") {
      const zip = await JSZip.loadAsync(file);
      const kmlFiles = Object.values(zip.files).filter((entry) => entry.name.toLowerCase().endsWith(".kml"));
      for (const entry of kmlFiles) {
        allKmlTexts.push({ name: entry.name, text: await entry.async("text") });
      }
      continue;
    }
    throw new Error(`File ${file.name} is not a .kmz or .kml file.`);
  }

  if (!allKmlTexts.length) throw new Error("No KML document was found inside the uploaded file(s).");
  const fileName = validNames.length === 1 ? validNames[0] : `${validNames[0]} (+${validNames.length - 1} more)`;
  return { kmlTexts: allKmlTexts, fileName };
}

function safeDownloadBase(fileName: string) {
  return (
    fileName
      .replace(/\.(kmz|kml|dxf|dwg)$/i, "")
      .replace(/[^a-z0-9_-]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "ftth-template"
  );
}

function downloadText(fileName: string, text: string, type = "application/dxf") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function residentialPreviewHtml(source: ConvertResult, context: ClassifiedPlacemark[]) {
  const spanAllowance = isPldtProvider(source.provider) ? 0.5 : 2.0;
  const placemarks = [...source.placemarks, ...context];
  const coords = collectCoordinates(placemarks);
  const resAreas = placemarks.filter((placemark) => placemark.layer === "RESIDENTIAL_AREAS" || placemark.layer === "RESIDENTIAL_LOTS");
  const commercialAreas = placemarks.filter((placemark) => placemark.layer === "COMMERCIAL_AREAS");
  const industrialAreas = placemarks.filter((placemark) => placemark.layer === "INDUSTRIAL_AREAS");
  const communityAreas = placemarks.filter((placemark) => placemark.layer === "COMMUNITY_AREAS");
  const buildings = placemarks.filter((placemark) => placemark.layer === "BUILDING_FOOTPRINTS");
  const roads = placemarks.filter((placemark) => placemark.layer === "ROAD_CENTERLINES");
  const poles = placemarks.filter((placemark) => placemark.geometry.type === "Point");
  const cableRoutes = placemarks.filter(
    (placemark) =>
      placemark.geometry.type === "LineString" &&
      (placemark.layer === "CABLE_ROUTES" || placemark.layer === "SPAN" || placemark.layer === "SOURCE_LINES"),
  );
  const centerLon = coords.reduce((sum, point) => sum + point.lon, 0) / Math.max(coords.length, 1);
  const centerLat = coords.reduce((sum, point) => sum + point.lat, 0) / Math.max(coords.length, 1);

  const payload = {
    center: [centerLat, centerLon],
    bounds: coords.map((point) => [point.lat, point.lon]),
    spanAllowance,
    residentialAreas: resAreas
      .filter((placemark) => placemark.geometry.type === "Polygon")
      .map((placemark) => ({
        name: placemark.name,
        rings: (placemark.geometry as Extract<Geometry, { type: "Polygon" }>).coordinates.map((ring) => ring.map((point) => [point.lat, point.lon])),
      })),
    commercialAreas: commercialAreas
      .filter((placemark) => placemark.geometry.type === "Polygon")
      .map((placemark) => ({
        name: placemark.name,
        rings: (placemark.geometry as Extract<Geometry, { type: "Polygon" }>).coordinates.map((ring) => ring.map((point) => [point.lat, point.lon])),
      })),
    industrialAreas: industrialAreas
      .filter((placemark) => placemark.geometry.type === "Polygon")
      .map((placemark) => ({
        name: placemark.name,
        rings: (placemark.geometry as Extract<Geometry, { type: "Polygon" }>).coordinates.map((ring) => ring.map((point) => [point.lat, point.lon])),
      })),
    communityAreas: communityAreas
      .filter((placemark) => placemark.geometry.type === "Polygon")
      .map((placemark) => ({
        name: placemark.name,
        rings: (placemark.geometry as Extract<Geometry, { type: "Polygon" }>).coordinates.map((ring) => ring.map((point) => [point.lat, point.lon])),
      })),
    buildings: buildings
      .filter((placemark) => placemark.geometry.type === "Polygon")
      .map((placemark) => ({
        name: placemark.name,
        rings: (placemark.geometry as Extract<Geometry, { type: "Polygon" }>).coordinates.map((ring) => ring.map((point) => [point.lat, point.lon])),
      })),
    roads: roads
      .filter((placemark) => placemark.geometry.type === "LineString")
      .map((placemark) => {
        const info = classifyRoadHierarchy(placemark.properties);
        return {
          name: normalizeRoadDisplayName(placemark.name).name,
          category: info.category,
          categoryLabel: info.categoryLabel,
          totalWidth: info.totalWidth,
          coordinates: (placemark.geometry as Extract<Geometry, { type: "LineString" }>).coordinates.map((point) => [point.lat, point.lon]),
        };
      }),
    cableRoutes: cableRoutes
      .filter((placemark) => placemark.geometry.type === "LineString")
      .map((placemark) => {
        const lineCoords = (placemark.geometry as Extract<Geometry, { type: "LineString" }>).coordinates;
        const spans: Array<{ midpoint: [number, number]; lengthText: string }> = [];
        for (let i = 0; i < lineCoords.length - 1; i++) {
          const p1 = lineCoords[i];
          const p2 = lineCoords[i + 1];
          const d = haversineDistance(p1, p2);
          const measured = (d + spanAllowance).toFixed(1);
          spans.push({
            midpoint: [(p1.lat + p2.lat) / 2, (p1.lon + p2.lon) / 2],
            lengthText: `${measured}m`,
          });
        }
        return {
          name: placemark.name,
          coordinates: lineCoords.map((point) => [point.lat, point.lon]),
          spans,
        };
      }),
    poles: poles
      .filter((placemark) => placemark.geometry.type === "Point")
      .map((placemark) => {
        const fields = poleTemplateFields(placemark);
        const point = (placemark.geometry as Extract<Geometry, { type: "Point" }>).coordinates;
        return {
          name: fields.poleNo,
          owner: fields.owner,
          poleType: fields.poleType,
          coordinates: [point.lat, point.lon],
        };
      }),
  };
  const serializedPayload = JSON.stringify(payload).replace(/</g, "\\u003c");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>FTTH Area Preview - ${escapeHtml(source.fileName)}</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html,body,#map{height:100%;margin:0}
    body{background:#111820;color:#e8eef2;font-family:Arial,sans-serif}
    header{position:absolute;z-index:700;left:16px;right:16px;top:14px;display:flex;align-items:center;justify-content:space-between;gap:20px;padding:12px 16px;background:rgba(25,36,45,.92);border:1px solid #2e3d48;border-radius:8px;box-shadow:0 10px 30px rgba(0,0,0,.28)}
    h1{margin:0;font-size:18px}
    .meta{color:#aebbc5;font-size:13px}
    #map{background:#202a33}
    .legend{display:flex;gap:16px;flex-wrap:wrap;font-size:13px}
    .legend span{display:inline-flex;align-items:center;gap:6px}
    i{width:14px;height:10px;display:inline-block;border:1px solid #8fa0aa}
    .leaflet-control-layers{margin-top:82px}
    .res-label{color:#d3d6da;font:12px Arial,sans-serif;text-shadow:0 1px 2px #111;text-align:center}
    .pole-label{color:#fff;font:11px Arial,sans-serif;text-shadow:0 1px 3px #111;white-space:nowrap}
    .span-badge{background:#2e1065;color:#fdf4ff;border:1px solid #c026d3;font-size:11px;font-weight:700;padding:1px 4px;border-radius:4px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.5)}
  </style>
</head>
<body>
  <header>
    <div>
      <h1>FTTH Demand Area OSM Preview</h1>
      <div class="meta">${escapeHtml(source.fileName)} | Poles ${poles.length} | Aerial Routes ${cableRoutes.length} | Roads ${roads.length} | Buildings ${buildings.length}</div>
    </div>
    <div class="legend">
      <span><i style="background:#c026d3"></i> Aerial Route & Spans (+${spanAllowance.toFixed(1)}m)</span>
      <span><i style="background:#f59e0b"></i> National Highway</span>
      <span><i style="background:#38bdf8"></i> Secondary/Provincial</span>
      <span><i style="background:#f4f0e1"></i> Residential St</span>
      <span><i style="background:#94a3b8"></i> Barangay Rd</span>
      <span><i style="background:#64748b"></i> Interior Alley</span>
      <span><i style="background:#385f43"></i> Residential Area</span>
      <span><i style="background:#a9b1b7"></i> Buildings</span>
      <span><i style="background:#135dff;border-radius:50%"></i> Poles</span>
    </div>
  </header>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const data = ${serializedPayload};
    const map = L.map("map", { preferCanvas: true }).setView(data.center, 18);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 22,
      attribution: "&copy; OpenStreetMap contributors"
    }).addTo(map);

    const osmResidential = L.layerGroup().addTo(map);
    const osmCommercial = L.layerGroup().addTo(map);
    const osmIndustrial = L.layerGroup().addTo(map);
    const osmCommunity = L.layerGroup().addTo(map);
    const buildings = L.layerGroup().addTo(map);
    const roads = L.layerGroup().addTo(map);
    const cableRoutesLayer = L.layerGroup().addTo(map);
    const spanBadgesLayer = L.layerGroup().addTo(map);
    const schematicLots = L.layerGroup().addTo(map);
    const poles = L.layerGroup().addTo(map);

    data.residentialAreas.forEach((area) => {
      area.rings.forEach((ring) => L.polygon(ring, {
        color: "#8fc08d",
        weight: 1.4,
        fillColor: "#385f43",
        fillOpacity: 0.28
      }).bindTooltip(area.name).addTo(osmResidential));
    });

    data.commercialAreas.forEach((area) => {
      area.rings.forEach((ring) => L.polygon(ring, {
        color: "#e5b45e",
        weight: 1.6,
        fillColor: "#c08521",
        fillOpacity: 0.28
      }).bindTooltip(area.name).addTo(osmCommercial));
    });

    data.industrialAreas.forEach((area) => {
      area.rings.forEach((ring) => L.polygon(ring, {
        color: "#df7777",
        weight: 1.6,
        fillColor: "#963536",
        fillOpacity: 0.25
      }).bindTooltip(area.name).addTo(osmIndustrial));
    });

    data.communityAreas.forEach((area) => {
      area.rings.forEach((ring) => L.polygon(ring, {
        color: "#7fb1ee",
        weight: 1.6,
        fillColor: "#376db5",
        fillOpacity: 0.26
      }).bindTooltip(area.name).addTo(osmCommunity));
    });

    data.buildings.forEach((building) => {
      building.rings.forEach((ring) => L.polygon(ring, {
        color: "#d9dee2",
        weight: 0.8,
        fillColor: "#a9b1b7",
        fillOpacity: 0.42
      }).bindTooltip(building.name).addTo(buildings));
    });

    data.roads.forEach((road) => {
      const isHwy = road.category === "motorway" || road.category === "national_highway";
      const isSec = road.category === "secondary_arterial";
      const isAlley = road.category === "interior_alley";
      const isBrgy = road.category === "barangay_road";
      const color = isHwy ? "#f59e0b" : isSec ? "#38bdf8" : isAlley ? "#64748b" : isBrgy ? "#94a3b8" : "#f4f0e1";
      const weight = isHwy ? 7 : isSec ? 5 : isAlley ? 2.5 : isBrgy ? 3.5 : 4;
      L.polyline(road.coordinates, {
        color: color,
        weight: weight,
        opacity: 0.95
      }).bindTooltip("<b>" + road.name + "</b>" + (road.categoryLabel ? "<br><span style='font-size:11px;color:#aaa'>" + road.categoryLabel + "</span>" : "")).addTo(roads);
    });

    data.cableRoutes.forEach((route) => {
      L.polyline(route.coordinates, {
        color: "#c026d3",
        weight: 4,
        dashArray: "6, 4",
        opacity: 0.95
      }).bindTooltip("<b>" + route.name + "</b> (Aerial Cable Route)").addTo(cableRoutesLayer);

      route.spans.forEach((span) => {
        L.marker(span.midpoint, {
          icon: L.divIcon({
            className: "span-badge",
            html: span.lengthText,
            iconSize: [44, 16],
            iconAnchor: [22, 8]
          })
        }).addTo(spanBadgesLayer);
      });
    });

    data.poles.forEach((pole) => {
      L.circleMarker(pole.coordinates, {
        radius: 5,
        color: "#f8fbff",
        weight: 1,
        fillColor: "#135dff",
        fillOpacity: 1
      }).bindTooltip(pole.name + "<br>" + pole.owner + "<br>" + pole.poleType).addTo(poles);
    });

    function addSchematicLots() {
      schematicLots.clearLayers();
      const zoom = Math.max(map.getZoom(), 18);
      let lotCount = 0;
      const maxLots = 260;
      data.roads.forEach((road) => {
        for (let index = 0; index < road.coordinates.length - 1 && lotCount < maxLots; index += 1) {
          const start = L.latLng(road.coordinates[index]);
          const end = L.latLng(road.coordinates[index + 1]);
          const a = map.project(start, zoom);
          const b = map.project(end, zoom);
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const length = Math.hypot(dx, dy);
          if (length < 54) continue;
          const unit = { x: dx / length, y: dy / length };
          const normal = { x: -unit.y, y: unit.x };
          const frontage = 44;
          const roadOffset = 13;
          const lotDepth = 58;
          const divisions = Math.min(12, Math.max(1, Math.floor(length / frontage)));
          for (let side of [-1, 1]) {
            for (let lot = 0; lot < divisions && lotCount < maxLots; lot += 1) {
              const t0 = lot / divisions;
              const t1 = (lot + 1) / divisions;
              const p0 = { x: a.x + dx * t0, y: a.y + dy * t0 };
              const p1 = { x: a.x + dx * t1, y: a.y + dy * t1 };
              const inner0 = { x: p0.x + normal.x * roadOffset * side, y: p0.y + normal.y * roadOffset * side };
              const inner1 = { x: p1.x + normal.x * roadOffset * side, y: p1.y + normal.y * roadOffset * side };
              const outer1 = { x: p1.x + normal.x * (roadOffset + lotDepth) * side, y: p1.y + normal.y * (roadOffset + lotDepth) * side };
              const outer0 = { x: p0.x + normal.x * (roadOffset + lotDepth) * side, y: p0.y + normal.y * (roadOffset + lotDepth) * side };
              const ring = [inner0, inner1, outer1, outer0].map((point) => map.unproject(point, zoom));
              L.polygon(ring, {
                color: "#1f55ff",
                weight: 1.2,
                fillColor: "#1f55ff",
                fillOpacity: 0.06,
                interactive: false
              }).addTo(schematicLots);
              const labelPoint = map.unproject({
                x: (inner0.x + inner1.x + outer1.x + outer0.x) / 4,
                y: (inner0.y + inner1.y + outer1.y + outer0.y) / 4
              }, zoom);
              L.marker(labelPoint, {
                interactive: false,
                icon: L.divIcon({ className: "res-label", html: "RES", iconSize: [34, 14], iconAnchor: [17, 7] })
              }).addTo(schematicLots);
              lotCount += 1;
            }
          }
        }
      });
    }

    if (data.bounds.length) map.fitBounds(data.bounds, { paddingTopLeft: [20, 92], paddingBottomRight: [20, 20], maxZoom: 19 });
    addSchematicLots();
    map.on("zoomend moveend", addSchematicLots);
    L.control.layers(null, {
      "Aerial Cable Routes": cableRoutesLayer,
      ["Span Measurements (+" + (data.spanAllowance || 2).toFixed(1) + "m)"]: spanBadgesLayer,
      "OSM residential areas": osmResidential,
      "OSM commercial / retail": osmCommercial,
      "OSM industrial / warehouse": osmIndustrial,
      "OSM community / institutional": osmCommunity,
      "Schematic RES lot preview": schematicLots,
      "Building footprints": buildings,
      "OSM roads": roads,
      "KMZ poles": poles
    }, { collapsed: false }).addTo(map);
  </script>
</body>
</html>`;
}

function openPreviewTab(html: string) {
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  if (!opened) throw new Error("The browser blocked the preview tab. Allow popups for this local app and try again.");
}

const isStaticWeb = typeof window !== "undefined" && !window.location.hostname.match(/^(localhost|127\.0\.0\.1)/);

async function downloadDwg(
  fileName: string,
  dxf: string,
  options: {
    stencilTemplate?: boolean;
    electricStencil?: boolean;
    telcoProvider?: TelcoProvider;
    rawPoles?: ReturnType<typeof rawPoleStencilPlacements>;
  } = {},
) {
  if (isStaticWeb) {
    throw new Error(
      "Direct .DWG compilation requires local AutoCAD or the desktop app. On the web version, please click 'Download DXF' instead — it opens natively in AutoCAD with all layers, blocks, and alignments! To export direct .DWG, run the standalone FTTH-KMZ-to-CAD.exe desktop app.",
    );
  }

  let response: Response;
  try {
    const backendProvider = options.telcoProvider && isPldtProvider(options.telcoProvider) ? options.telcoProvider : "globe";
    response = await fetch("/api/convert-dwg", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName, dxf, ...options, telcoProvider: backendProvider }),
    });
  } catch {
    throw new Error("Could not reach the DWG converter. Keep the local app server running and try again.");
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    if (response.status === 404 || response.status === 405) {
      throw new Error(
        "DWG converter backend is unavailable on this host. Please use 'Download DXF' (which opens directly in AutoCAD) or run the FTTH-KMZ-to-CAD.exe desktop app.",
      );
    }
    throw new Error(payload?.error || "AutoCAD could not create the DWG file.");
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  const providerSuffix = isPldtProvider(options.telcoProvider) ? "pldt-template" : "ftth-template";
  link.download = `${safeDownloadBase(fileName)}-${options.stencilTemplate || options.electricStencil ? "raw-poles-stencil" : providerSuffix}.dwg`;
  link.click();
  URL.revokeObjectURL(url);
}

export const LICENSE_EXPIRY_DATE_STR = "September 2, 2027";
export const LICENSE_EXPIRY_TIMESTAMP = new Date("2027-09-02T23:59:59Z").getTime();

export function isLicenseExpired(): boolean {
  return Date.now() > LICENSE_EXPIRY_TIMESTAMP;
}

export function getRemainingLicenseDays(): number {
  const diffMs = LICENSE_EXPIRY_TIMESTAMP - Date.now();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

type UsageLogRecord = {
  id: string;
  timestamp: string;
  appVersion: string;
  event: string;
  mode: string;
  provider: string;
  fileName: string;
  itemCount: number;
  summary: string;
  machine: {
    hostname: string;
    username: string;
    platform: string;
    osRelease?: string;
    arch?: string;
    machineId: string;
  };
  revoked: boolean;
};

type UsageStatusPayload = {
  ok: boolean;
  machine: {
    hostname: string;
    username: string;
    platform: string;
    osRelease: string;
    arch: string;
    machineId: string;
  };
  revocation: {
    revoked: boolean;
    reason?: string;
    revokedAt?: string;
    checkedAt?: string;
  };
  config: {
    webhookUrl: string;
    killSwitchUrl: string;
    hasWebhook: boolean;
    hasKillSwitch: boolean;
    auditLogPath: string;
  };
  recentLogs: UsageLogRecord[];
};

const GOOGLE_APPS_SCRIPT_TEMPLATE = `// ============================================================================
// FTTH KMZ to AutoCAD Converter — Google Sheets Usage Logger & Remote Kill-Switch
// Author: Caesar Ian Samulde
// Setup:
// 1. Open Google Sheets -> Extensions -> Apps Script
// 2. Paste this code and set REVOKED = false (or true to disable the app remotely!)
// 3. Click Deploy -> New deployment -> Web app -> Who has access: "Anyone"
// 4. Copy the Web App URL and paste it into BOTH Webhook URL & Kill-Switch URL!
// ============================================================================

const REVOKED = false; // <-- CHANGE TO true TO REMOTELY LOCK & DISABLE THE TOOL
const REVOCATION_MESSAGE = "License revoked by Caesar Ian Samulde. Unauthorized post-employment usage is strictly prohibited.";

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: REVOKED ? "REVOKED" : "ACTIVE",
    revoked: REVOKED,
    message: REVOCATION_MESSAGE,
    updatedAt: new Date().toISOString()
  })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(["Timestamp", "Event", "Machine (Host\\\\User)", "Machine ID", "Mode", "Provider", "File Name", "Items", "Summary", "Version", "Revoked"]);
    }
    const data = JSON.parse(e.postData.contents);
    const m = data.machine || {};
    sheet.appendRow([
      data.timestamp || new Date().toISOString(),
      data.event || "UNKNOWN",
      (m.hostname || "unknown") + "\\\\" + (m.username || "unknown"),
      m.machineId || "",
      data.mode || "",
      data.provider || "",
      data.fileName || "",
      data.itemCount || 0,
      data.summary || "",
      data.appVersion || "",
      Boolean(data.revoked)
    ]);
    return ContentService.createTextOutput(JSON.stringify({ ok: true, revoked: REVOKED }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}`;

const GITHUB_GIST_KILLSWITCH_TEMPLATE = `{
  "status": "ACTIVE",
  "revoked": false,
  "message": "License revoked by author Caesar Ian Samulde. All company usage rights have been terminated."
}`;

const DEFAULT_WEB_WEBHOOK_URL =
  "https://script.google.com/macros/s/AKfycbzcWyNP8xAHasoXaYkvRK_0Vcrm3HMDA7BtP226Kx2PIGEZTq-VtNNCGZw0faitNkuB/exec";
const DEFAULT_WEB_KILLSWITCH_URL =
  "https://script.google.com/macros/s/AKfycbzcWyNP8xAHasoXaYkvRK_0Vcrm3HMDA7BtP226Kx2PIGEZTq-VtNNCGZw0faitNkuB/exec";

function getWebTelemetryConfig() {
  let webhookUrl = DEFAULT_WEB_WEBHOOK_URL;
  let killSwitchUrl = DEFAULT_WEB_KILLSWITCH_URL;
  try {
    const savedHook = localStorage.getItem("ftth_telemetry_webhook_url");
    if (savedHook) webhookUrl = savedHook;
    const savedKill = localStorage.getItem("ftth_telemetry_killswitch_url");
    if (savedKill) killSwitchUrl = savedKill;
  } catch {}
  return { webhookUrl, killSwitchUrl };
}

function saveWebTelemetryConfig(webhookUrl: string, killSwitchUrl: string) {
  try {
    localStorage.setItem("ftth_telemetry_webhook_url", webhookUrl.trim());
    localStorage.setItem("ftth_telemetry_killswitch_url", killSwitchUrl.trim());
  } catch {}
}

function getWebClientIdentity() {
  if (typeof window === "undefined") {
    return {
      hostname: "Web Client",
      username: "user",
      platform: "Web",
      osRelease: "browser",
      arch: "x64",
      machineId: "WEB-00000000",
      sessionId: "SESS-0",
      domainUser: "Web Client\\user",
      osInfo: "Web Browser",
    };
  }

  let clientId = "";
  try {
    clientId = localStorage.getItem("ftth_web_client_id") || "";
    if (!clientId) {
      clientId = "CLI-" + Math.random().toString(36).substring(2, 8).toUpperCase() + "-" + Date.now().toString(36).toUpperCase();
      localStorage.setItem("ftth_web_client_id", clientId);
    }
  } catch {
    clientId = "CLI-WEB-" + Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  let sessionId = "";
  try {
    sessionId = sessionStorage.getItem("ftth_web_session_id") || "";
    if (!sessionId) {
      sessionId = "SESS-" + Math.random().toString(36).substring(2, 8).toUpperCase() + "-" + Date.now().toString(36).toUpperCase();
      sessionStorage.setItem("ftth_web_session_id", sessionId);
    }
  } catch {
    sessionId = "SESS-TEMP-" + Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  const ua = navigator.userAgent || "";
  let os = "Windows";
  if (/Windows NT 10/i.test(ua)) os = "Windows 10/11";
  else if (/Windows NT 6\.3/i.test(ua)) os = "Windows 8.1";
  else if (/Windows NT 6\.1/i.test(ua)) os = "Windows 7";
  else if (/Macintosh|Mac OS X/i.test(ua)) os = "macOS";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
  else if (/Linux/i.test(ua)) os = "Linux";

  let browser = "Chrome";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/Chrome\//i.test(ua)) browser = "Chrome";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";
  else if (/Safari\//i.test(ua)) browser = "Safari";

  const screenRes = typeof window.screen !== "undefined" ? `${window.screen.width}x${window.screen.height}` : "unknown";
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const language = navigator.language || "en";

  const hostname = `${browser} on ${os}`;
  const username = `WebUser-${clientId.slice(4, 10)}`;
  const domainUser = `${hostname}\\${username}`;
  const osInfo = `${os} • ${browser} • ${screenRes} • ${timezone} • ${language}`;

  return {
    hostname,
    username,
    platform: `Web (${os})`,
    osRelease: `${browser} [${screenRes}]`,
    arch: timezone,
    machineId: clientId,
    sessionId,
    domainUser,
    osInfo,
  };
}

function formatWebDiscordPayload(record: any) {
  const eventColors: Record<string, number> = {
    APP_LAUNCH: 0x16a34a,
    WEB_SESSION_START: 0x16a34a,
    KMZ_CONVERT: 0x2563eb,
    EXPORT_DWG: 0xdc2626,
    EXPORT_DWG_ATTEMPT: 0xd97706,
    EXPORT_DXF: 0xd97706,
    EXPORT_CSV: 0x7c3aed,
    OSM_ROADS_FETCH: 0x0284c7,
    TEST_PING: 0x0284c7,
  };
  const color = eventColors[record.event] || 0x475569;
  const fields = [
    { name: "👤 User / Client", value: `\`${record.machine?.domainUser || record.machine?.hostname}\``, inline: true },
    { name: "🔑 Client ID", value: `\`${record.machine?.machineId || "N/A"}\``, inline: true },
    { name: "📦 App Version", value: `\`v${record.appVersion || "2.2.9"} (Web)\``, inline: true },
  ];
  if (record.fileName) fields.push({ name: "📄 File Name", value: `\`${record.fileName}\``, inline: true });
  if (record.mode) fields.push({ name: "🛠️ Mode / Provider", value: `${record.mode} (${(record.provider || "").toUpperCase()})`, inline: true });
  if (record.itemCount) fields.push({ name: "📊 Total Objects", value: String(record.itemCount), inline: true });
  if (record.summary) fields.push({ name: "📋 Summary", value: String(record.summary).slice(0, 1000), inline: false });
  fields.push({ name: "💻 Device / Info", value: record.machine?.osInfo || "Web Browser", inline: true });
  fields.push({ name: "🕒 Timestamp", value: record.timestamp, inline: true });

  return {
    username: "FTTH Web Usage Monitor",
    embeds: [
      {
        title: `🌐 Web Activity: ${record.event}`,
        description: record.revoked
          ? "⚠️ **ALERT: Web activity with REVOKED status!**"
          : "Active user session activity recorded on GitHub Pages / Web.",
        color,
        fields,
        footer: { text: "FTTH KMZ to CAD • Caesar Ian Samulde" },
        timestamp: record.timestamp,
      },
    ],
  };
}

async function sendWebTelemetryRecord(webhookUrl: string, record: any): Promise<boolean> {
  if (!webhookUrl) return false;
  const isDiscord = /discord(?:app)?\.com\/api\/webhooks\//i.test(webhookUrl);
  const isGoogleScript = /script\.google\.com/i.test(webhookUrl);
  const payload = isDiscord ? JSON.stringify(formatWebDiscordPayload(record)) : JSON.stringify(record);

  try {
    if (isGoogleScript) {
      if (typeof navigator !== "undefined" && navigator.sendBeacon) {
        const blob = new Blob([payload], { type: "text/plain;charset=utf-8" });
        if (navigator.sendBeacon(webhookUrl, blob)) return true;
      }
      await fetch(webhookUrl, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: payload,
      });
      return true;
    } else {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
      });
      return res.ok || res.status === 204;
    }
  } catch {
    return false;
  }
}

async function checkWebRemoteKillSwitch(killSwitchUrl: string): Promise<{ revoked: boolean; reason?: string }> {
  if (!killSwitchUrl) {
    try {
      const saved = localStorage.getItem("ftth_web_revoked");
      if (saved) return JSON.parse(saved);
    } catch {}
    return { revoked: false };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(killSwitchUrl, { signal: controller.signal, cache: "no-store" });
    clearTimeout(timeout);
    if (res.ok) {
      const text = await res.text();
      try {
        const json = JSON.parse(text);
        if (json && (json.revoked === true || String(json.status).toUpperCase() === "REVOKED")) {
          const state = { revoked: true, reason: json.message || json.reason || "Software license revoked by author Caesar Ian Samulde." };
          localStorage.setItem("ftth_web_revoked", JSON.stringify(state));
          return state;
        } else if (json && (json.revoked === false || String(json.status).toUpperCase() === "ACTIVE")) {
          localStorage.removeItem("ftth_web_revoked");
          return { revoked: false };
        }
      } catch {
        const upper = text.toUpperCase();
        if (upper.startsWith("REVOKED") || upper.startsWith("DISABLED") || upper.startsWith("TERMINATED")) {
          const customReason = text.includes(":") ? text.split(":").slice(1).join(":").trim() : "";
          const state = { revoked: true, reason: customReason || "License revoked by author Caesar Ian Samulde." };
          localStorage.setItem("ftth_web_revoked", JSON.stringify(state));
          return state;
        } else if (upper.startsWith("ACTIVE") || upper.startsWith("OK")) {
          localStorage.removeItem("ftth_web_revoked");
          return { revoked: false };
        }
      }
    }
  } catch {
    // Offline or unreachable
  }

  try {
    const saved = localStorage.getItem("ftth_web_revoked");
    if (saved) return JSON.parse(saved);
  } catch {}
  return { revoked: false };
}

function appendWebAuditLog(record: UsageLogRecord) {
  try {
    const raw = localStorage.getItem("ftth_web_audit_logs");
    const logs: UsageLogRecord[] = raw ? JSON.parse(raw) : [];
    logs.push(record);
    localStorage.setItem("ftth_web_audit_logs", JSON.stringify(logs.slice(-60)));
  } catch {}
}

function getWebRecentLogs(): UsageLogRecord[] {
  try {
    const raw = localStorage.getItem("ftth_web_audit_logs");
    if (raw) {
      const logs = JSON.parse(raw);
      if (Array.isArray(logs)) return logs.slice().reverse();
    }
  } catch {}
  return [];
}

async function fetchClientUsageStatus(forceCheck = false): Promise<UsageStatusPayload | null> {
  if (!isStaticWeb) {
    try {
      const res = await fetch(`/api/usage-status${forceCheck ? "?check=1" : ""}`);
      if (res.ok) {
        const data = (await res.json()) as UsageStatusPayload;
        return data;
      }
    } catch {}
  }

  const client = getWebClientIdentity();
  const config = getWebTelemetryConfig();
  const revocation = await checkWebRemoteKillSwitch(config.killSwitchUrl);
  const recentLogs = getWebRecentLogs();

  return {
    ok: true,
    machine: {
      hostname: client.hostname,
      username: client.username,
      platform: client.platform,
      osRelease: client.osRelease,
      arch: client.arch,
      machineId: client.machineId,
    },
    revocation: {
      revoked: Boolean(revocation.revoked),
      reason: revocation.reason,
      checkedAt: new Date().toISOString(),
    },
    config: {
      webhookUrl: config.webhookUrl,
      killSwitchUrl: config.killSwitchUrl,
      hasWebhook: Boolean(config.webhookUrl),
      hasKillSwitch: Boolean(config.killSwitchUrl),
      auditLogPath: "Browser Storage & Remote Webhook (Web Client)",
    },
    recentLogs,
  };
}

async function logClientUsageEvent(payload: {
  event: string;
  mode?: string;
  provider?: string;
  fileName?: string;
  itemCount?: number;
  summary?: string;
  details?: Record<string, unknown>;
}): Promise<{ revoked?: boolean; reason?: string } | null> {
  if (!isStaticWeb) {
    try {
      const res = await fetch("/api/usage-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        return data?.revocation || null;
      }
    } catch {}
  }

  const client = getWebClientIdentity();
  const config = getWebTelemetryConfig();
  const revocation = await checkWebRemoteKillSwitch(config.killSwitchUrl);

  const record: UsageLogRecord = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    event: payload.event,
    appVersion: "2.2.9",
    mode: payload.mode || "pole_survey",
    provider: payload.provider || "globe",
    fileName: payload.fileName || "",
    itemCount: payload.itemCount || 0,
    summary: payload.summary || "",
    machine: {
      hostname: client.hostname,
      username: client.username,
      platform: client.platform,
      osRelease: client.osRelease,
      arch: client.arch,
      machineId: client.machineId,
    },
    revoked: Boolean(revocation.revoked),
  };

  appendWebAuditLog(record);

  if (config.webhookUrl) {
    void sendWebTelemetryRecord(config.webhookUrl, record);
  }

  return revocation;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en", { maximumFractionDigits: 3 }).format(value);
}

function App() {
  const [hasAcceptedEula, setHasAcceptedEula] = useState<boolean>(() => {
    try {
      return localStorage.getItem("ftth_eula_accepted_v1") === "true";
    } catch {
      return false;
    }
  });
  const [eulaCheckbox, setEulaCheckbox] = useState(false);
  const [eulaDeclined, setEulaDeclined] = useState(false);
  const [result, setResult] = useState<ConvertResult | null>(null);
  const [poleStandard, setPoleStandard] = useState<PoleStandard>(defaultPoleStandard);
  const [roadStandard, setRoadStandard] = useState<RoadWidthStandard>(defaultRoadWidthStandard);
  const [cableStandard, setCableStandard] = useState<CableSpanStandard>(defaultCableSpanStandard);
  const [coordinateMode, setCoordinateMode] = useState<CoordinateMode>("mercator");
  const [telcoProvider, setTelcoProvider] = useState<TelcoProvider>("globe");
  const [converterMode, setConverterMode] = useState<ConverterMode>("pole_survey");
  const [napResult, setNapResult] = useState<HldConvertResult | null>(null);
  const [napStandard, setNapStandard] = useState<HldNapStandard>(defaultHldNapStandard);
  const [isWorking, setIsWorking] = useState(false);
  const [isFetchingRoads, setIsFetchingRoads] = useState(false);
  const [isConvertingDwg, setIsConvertingDwg] = useState(false);
  const [isConvertingNapDwg, setIsConvertingNapDwg] = useState(false);
  const [showLicenseModal, setShowLicenseModal] = useState(false);
  const [showChangelogModal, setShowChangelogModal] = useState(false);
  const [showTelemetryModal, setShowTelemetryModal] = useState(false);
  const [showProposedNapMapModal, setShowProposedNapMapModal] = useState(false);
  const [hldReferencePins, setHldReferencePins] = useState<HldOverlayPin[]>([]);
  const [hldReferenceLines, setHldReferenceLines] = useState<MapOverlayLine[]>([]);
  const [hldNapsSource, setHldNapsSource] = useState<HldProposedNapItem[]>([]);
  const [attachedHldFileName, setAttachedHldFileName] = useState<string>("");

  const activeHldProposedNaps = useMemo<HldProposedNapItem[]>(() => {
    if (hldNapsSource.length > 0) return hldNapsSource;

    if (hldReferencePins.length > 0) {
      const proposed = hldReferencePins.filter((pin) => pin.status === "PROPOSED");
      if (proposed.length > 0) {
        return proposed.map((pin) => ({
          id: pin.id,
          name: pin.name,
          coordinates: { lat: pin.lat, lon: pin.lon },
          napLines: pin.lines || 8,
        }));
      }
    }

    if (napResult && napResult.naps.length > 0) {
      const proposed = napResult.naps.filter(
        (n) => n.status === "PROPOSED" && !n.isDummy && n.geometry.type === "Point",
      );
      if (proposed.length > 0) {
        return proposed.map((n) => ({
          id: n.id,
          name: n.name || n.napId || "Proposed NAP",
          coordinates: (n.geometry as Extract<Geometry, { type: "Point" }>).coordinates,
          napLines: resolveHldProposedNapLines({
            name: n.name || n.napId,
            description: n.description,
            properties: n.properties,
          }),
        }));
      }
    }

    return [];
  }, [hldNapsSource, hldReferencePins, napResult]);

  async function handleAttachHldKmz(file: File) {
    try {
      const source = await readSourceFile(file);
      const parsed = source.kmlTexts.flatMap((kml) => parseKml(kml.text));
      const extracted = extractHldProposedNapsFromPlacemarks(parsed);
      if (extracted.length === 0) {
        setError(`No proposed NAPs found in ${file.name}. Ensure it contains proposed NAP placemarks.`);
        return;
      }
      setHldNapsSource(extracted);
      setAttachedHldFileName(file.name);
      setError("");

      if (result) {
        const { dxf, zone } = createDxf(
          result.placemarks,
          result.center,
          result.fileName,
          poleStandard,
          coordinateMode,
          "STANDARD",
          telcoProvider,
          roadStandard,
          cableStandard,
          extracted,
        );
        setResult({ ...result, dxf, zone });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load HLD reference file.");
    }
  }
  const [usageStatus, setUsageStatus] = useState<UsageStatusPayload | null>(null);
  const [authorPasskey, setAuthorPasskey] = useState("");
  const [authorUnlocked, setAuthorUnlocked] = useState(false);
  const [webhookUrlInput, setWebhookUrlInput] = useState("");
  const [killSwitchUrlInput, setKillSwitchUrlInput] = useState("");
  const [telemetryStatusMsg, setTelemetryStatusMsg] = useState("");
  const [isSavingTelemetry, setIsSavingTelemetry] = useState(false);
  const [error, setError] = useState("");
  const [osmMessage, setOsmMessage] = useState("");

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const status = await fetchClientUsageStatus(true);
      if (mounted && status) {
        setUsageStatus(status);
        setWebhookUrlInput(status.config?.webhookUrl || "");
        setKillSwitchUrlInput(status.config?.killSwitchUrl || "");
      }
      const client = getWebClientIdentity();
      const rev = await logClientUsageEvent({
        event: isStaticWeb ? "WEB_SESSION_START" : "APP_LAUNCH",
        mode: "pole_survey",
        provider: "globe",
        summary: isStaticWeb
          ? `User started web session on FTTH KMZ Converter (${client.hostname}) [${client.osRelease}]`
          : "User opened FTTH KMZ to AutoCAD Converter UI",
      });
      if (mounted && rev?.revoked) {
        const refreshed = await fetchClientUsageStatus(false);
        if (refreshed) setUsageStatus(refreshed);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  async function handleSaveTelemetryConfig(sendTestPing = false) {
    setIsSavingTelemetry(true);
    setTelemetryStatusMsg("");
    try {
      if (!isStaticWeb) {
        try {
          const res = await fetch("/api/usage-config", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              passkey: authorPasskey || "samulde2026",
              webhookUrl: webhookUrlInput.trim(),
              killSwitchUrl: killSwitchUrlInput.trim(),
              testPing: sendTestPing,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.ok) {
              const refreshed = await fetchClientUsageStatus(false);
              if (refreshed) setUsageStatus(refreshed);
              setTelemetryStatusMsg(
                sendTestPing
                  ? "✅ Saved configuration & dispatched TEST_PING to webhook!"
                  : "✅ Saved telemetry & kill-switch configuration.",
              );
              return;
            }
          }
        } catch {}
      }

      saveWebTelemetryConfig(webhookUrlInput, killSwitchUrlInput);
      if (sendTestPing && webhookUrlInput.trim()) {
        const client = getWebClientIdentity();
        const testRecord: UsageLogRecord = {
          id: `${Date.now()}-test`,
          timestamp: new Date().toISOString(),
          event: "TEST_PING",
          appVersion: "2.2.9",
          mode: converterMode,
          provider: telcoProvider,
          fileName: "test-ping.kmz",
          itemCount: 1,
          summary: `Test Ping dispatched from Web Browser (${client.hostname}) to verify Webhook`,
          machine: {
            hostname: client.hostname,
            username: client.username,
            platform: client.platform,
            osRelease: client.osRelease,
            arch: client.arch,
            machineId: client.machineId,
          },
          revoked: false,
        };
        appendWebAuditLog(testRecord);
        await sendWebTelemetryRecord(webhookUrlInput.trim(), testRecord);
      }
      const refreshed = await fetchClientUsageStatus(true);
      if (refreshed) setUsageStatus(refreshed);
      setTelemetryStatusMsg(
        sendTestPing
          ? "✅ Saved web telemetry config & sent TEST_PING directly to your Webhook!"
          : "✅ Saved web telemetry configuration successfully.",
      );
    } catch (err) {
      setTelemetryStatusMsg(`Error: ${err instanceof Error ? err.message : "Network error"}`);
    } finally {
      setIsSavingTelemetry(false);
    }
  }

  const poleDeflectionMap = useMemo(() => {
    if (!result) return new Map<string, number>();
    return computePoleDeflectionMap(result.placemarks);
  }, [result]);

  const counts = useMemo(() => {
    if (!result) return null;
    const base = result.placemarks.reduce<Record<string, number>>((acc, placemark) => {
      acc[placemark.layer] = (acc[placemark.layer] || 0) + 1;
      if (isPldtProvider(telcoProvider) && placemark.geometry.type === "Point") {
        const clamp = resolvePldtPoleClampInfo(
          placemark,
          poleDeflectionMap.get(placemark.id) || 0,
          telcoProvider,
        );
        acc[clamp.layer] = (acc[clamp.layer] || 0) + 1;
      }
      return acc;
    }, Object.fromEntries(Object.keys(layerMeta).map((layer) => [layer, 0])) as Record<string, number>);
    if (isPldtProvider(telcoProvider) && result.placemarks.length > 0) {
      base.SAG = (base.SAG || 0) + 1;
      base["LOT BOUNDARY"] = (base["LOT BOUNDARY"] || 0) + 1;
      base["NAP BOUNDREY"] = (base["NAP BOUNDREY"] || 0) + 1;
    }
    return base;
  }, [result, telcoProvider, poleDeflectionMap]);

  const poleCounts = useMemo(() => {
    if (!result) return null;
    const poles = result.placemarks.filter((p) => p.geometry.type === "Point");
    const byLayer: Record<string, number> = {};
    const byClamp: Record<string, number> = {};
    for (const p of poles) {
      byLayer[p.layer] = (byLayer[p.layer] || 0) + 1;
      if (isPldtProvider(telcoProvider)) {
        const clamp = resolvePldtPoleClampInfo(
          p,
          poleDeflectionMap.get(p.id) || 0,
          telcoProvider,
        );
        byClamp[clamp.code] = (byClamp[clamp.code] || 0) + 1;
      }
    }
    return {
      totalPoles: poles.length,
      byLayer,
      byClamp,
    };
  }, [result, telcoProvider, poleDeflectionMap]);

  const napCounts = useMemo(() => {
    if (!napResult) return null;
    const naps = napResult.placemarks.filter((p) => p.geometry.type === "Point" && p.layer !== "CLUSTER_BOUNDARIES" && p.layer !== "OLT_POI");
    const proposed = naps.filter((p) => p.status === "PROPOSED").length;
    const vetted = naps.filter((p) => p.status === "VETTED").length;
    const source = naps.filter((p) => p.status === "SOURCE").length;
    const dummy = naps.filter((p) => (p.status === "DUMMY" || p.isDummy) && p.status !== "EXISTING").length;
    const existing = naps.filter((p) => p.status === "EXISTING").length;
    const existingNaps = naps.filter((p) => p.status === "EXISTING" && !p.isDummy).length;
    const existingDummy = naps.filter((p) => p.status === "EXISTING" && p.isDummy).length;
    const splitters = naps.reduce<Record<string, number>>((acc, p) => {
      if (p.isDummy) return acc;
      acc[p.splitter] = (acc[p.splitter] || 0) + 1;
      return acc;
    }, {});
    const feeders = napResult.placemarks.filter(
      (p) => p.geometry.type === "LineString" && (p.layer === "FEEDER_CABLES" || p.layer === "CABLE_ROUTES"),
    );
    return {
      totalNaps: naps.length,
      proposed,
      vetted,
      source,
      dummy,
      existing,
      existingNaps,
      existingDummy,
      splitters,
      feedersCount: feeders.length,
    };
  }, [napResult]);

  async function handleNapFile(fileOrFiles: File | File[] | FileList) {
    if (isLicenseExpired()) {
      setError("Software license expired on September 2, 2027. Contact Caesar Ian Samulde for renewal.");
      return;
    }
    if (usageStatus?.revocation?.revoked) {
      setError(usageStatus.revocation.reason || "Software license has been revoked by Caesar Ian Samulde.");
      return;
    }
    setError("");
    setIsWorking(true);
    try {
      const source = await readSourceFile(fileOrFiles);
      const parsed = source.kmlTexts.flatMap((kml) => parseKml(kml.text));
      if (!parsed.length) throw new Error("The KML data did not contain readable placemarks.");
      const projectPrefix = detectProjectPrefix(parsed, source.fileName);
      const placemarks = parsed.map((p, idx) => classifyNapPlacemark(p, napStandard, idx, projectPrefix));
      const naps = placemarks.filter((p) => p.geometry.type === "Point" && p.layer !== "CLUSTER_BOUNDARIES" && p.layer !== "OLT_POI");
      const center = calculateCenter(collectCoordinates(parsed));
      const { dxf, zone } = createHldNapDxf(placemarks, center, source.fileName, napStandard, coordinateMode, "STANDARD");
      setNapResult({
        fileName: source.fileName,
        kmlNames: source.kmlTexts.map((kml) => kml.name),
        placemarks,
        naps,
        center,
        zone,
        dxf,
        provider: napStandard.telcoProvider,
        projectPrefix,
      });
      const proposedCount = naps.filter((p) => p.status === "PROPOSED").length;
      const existingCount = naps.filter((p) => p.status === "EXISTING").length;
      const dummyCount = naps.filter((p) => (p.status === "DUMMY" || p.isDummy) && p.status !== "EXISTING").length;
      void logClientUsageEvent({
        event: "KMZ_CONVERT",
        mode: "hld_nap",
        provider: napStandard.telcoProvider,
        fileName: source.fileName,
        itemCount: naps.length,
        summary: `HLD NAP KMZ converted (${naps.length} NAPs: ${proposedCount} Proposed, ${existingCount} Existing, ${dummyCount} Dummy)`,
      });
    } catch (err) {
      setNapResult(null);
      setError(err instanceof Error ? err.message : "Unable to convert the selected file.");
    } finally {
      setIsWorking(false);
    }
  }

  function updateNapStandard(update: Partial<HldNapStandard>) {
    setNapStandard((current) => {
      const next = {
        ...current,
        ...update,
      };
      if (napResult) {
        const projectPrefix = napResult.projectPrefix || detectProjectPrefix(napResult.placemarks, napResult.fileName);
        const reclassified = napResult.placemarks.map((p, idx) =>
          p.geometry.type === "Point" ? classifyNapPlacemark(p, next, idx, projectPrefix) : p,
        );
        const { dxf, zone } = createHldNapDxf(
          reclassified,
          napResult.center,
          napResult.fileName,
          next,
          coordinateMode,
          "STANDARD",
        );
        setNapResult({
          ...napResult,
          placemarks: reclassified,
          naps: reclassified.filter((p) => p.geometry.type === "Point" && p.layer !== "CLUSTER_BOUNDARIES" && p.layer !== "OLT_POI"),
          dxf,
          zone,
          provider: next.telcoProvider,
          projectPrefix,
        });
      }
      return next;
    });
  }

  async function handleDownloadNapDwg() {
    if (!napResult) return;
    if (isLicenseExpired()) {
      setError("Software license expired on September 2, 2027. Contact Caesar Ian Samulde for renewal.");
      return;
    }
    if (usageStatus?.revocation?.revoked) {
      setError(usageStatus.revocation.reason || "Software license has been revoked by Caesar Ian Samulde.");
      return;
    }
    setError("");
    setIsConvertingNapDwg(true);
    try {
      await downloadDwg(napResult.fileName, napResult.dxf, { telcoProvider: napStandard.telcoProvider });
      void logClientUsageEvent({
        event: "EXPORT_DWG",
        mode: "hld_nap",
        provider: napStandard.telcoProvider,
        fileName: napResult.fileName,
        itemCount: napResult.naps.length,
        summary: `Exported HLD NAP DWG (${napResult.naps.length} NAPs)`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create DWG.");
    } finally {
      setIsConvertingNapDwg(false);
    }
  }

  function handleDownloadNapCsv() {
    if (!napResult) return;
    const csv = rawNapCsv(napResult.naps, napResult.center, napResult.zone, coordinateMode);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeDownloadBase(napResult.fileName)}-hld-naps-schedule.csv`;
    link.click();
    URL.revokeObjectURL(url);
    void logClientUsageEvent({
      event: "EXPORT_CSV",
      mode: "hld_nap",
      provider: napStandard.telcoProvider,
      fileName: napResult.fileName,
      itemCount: napResult.naps.length,
      summary: `Exported HLD NAP CSV Schedule (${napResult.naps.length} NAPs)`,
    });
  }

  async function handleFile(fileOrFiles: File | File[] | FileList) {
    if (isLicenseExpired()) {
      setError("Software license expired on September 2, 2027. Contact Caesar Ian Samulde for renewal.");
      return;
    }
    if (usageStatus?.revocation?.revoked) {
      setError(usageStatus.revocation.reason || "Software license has been revoked by Caesar Ian Samulde.");
      return;
    }
    setError("");
    setOsmMessage("");
    setIsWorking(true);
    try {
      const source = await readSourceFile(fileOrFiles);
      const parsed = source.kmlTexts.flatMap((kml) => parseKml(kml.text));
      if (!parsed.length) throw new Error("The KML data did not contain readable placemarks.");

      // Check if uploaded files contain HLD Proposed NAPs (Source of Truth)
      const autoHldNaps = extractHldProposedNapsFromPlacemarks(parsed);
      let effectiveHldNaps = hldNapsSource.length > 0 ? hldNapsSource : autoHldNaps;
      if (autoHldNaps.length > 0 && hldNapsSource.length === 0) {
        setHldNapsSource(autoHldNaps);
        setAttachedHldFileName(source.fileName);
        effectiveHldNaps = autoHldNaps;
      } else if (activeHldProposedNaps.length > 0 && effectiveHldNaps.length === 0) {
        effectiveHldNaps = activeHldProposedNaps;
      }

      // If autoHldNaps were found in the uploaded files, remove those HLD NAPs from pole placemarks
      const isHldNapPoint = (p: Placemark) => {
        if (p.geometry.type !== "Point") return false;
        const f = p.properties.Folder || p.properties._folder || "";
        return isNapEntity(p.name, f);
      };
      const isMapsMeDetected = parsed.some((p) => p.properties._mwm === "true");
      const activeProvider: TelcoProvider =
        isMapsMeDetected && telcoProvider === "globe" ? "globe_mapsme" : telcoProvider;
      let effectivePoleStandard = poleStandard;
      if (activeProvider !== telcoProvider) {
        setTelcoProvider(activeProvider);
        if (activeProvider === "globe_mapsme") {
          effectivePoleStandard = { ...poleStandard, includeFocCable: false };
          setPoleStandard(effectivePoleStandard);
        }
      }
      const filteredSurvey = filterPoleSurveyPlacemarks(parsed);
      const poleOnlyParsed = autoHldNaps.length > 0 ? filteredSurvey.filter((p) => !isHldNapPoint(p)) : filteredSurvey;
      const placemarks = poleOnlyParsed.map((p) => classifyPlacemark(p, activeProvider, effectivePoleStandard.electricUtility));
      const center = calculateCenter(collectCoordinates(poleOnlyParsed.length ? poleOnlyParsed : parsed));
      const { dxf, zone } = createDxf(
        placemarks,
        center,
        source.fileName,
        effectivePoleStandard,
        coordinateMode,
        "STANDARD",
        activeProvider,
        roadStandard,
        cableStandard,
        effectiveHldNaps,
      );
      setResult({ fileName: source.fileName, kmlNames: source.kmlTexts.map((kml) => kml.name), placemarks, center, zone, dxf, provider: activeProvider });
      const poles = placemarks.filter((p) => p.geometry.type === "Point");
      const layerBreakdown = poles.reduce<Record<string, number>>((acc, p) => {
        acc[p.layer] = (acc[p.layer] || 0) + 1;
        return acc;
      }, {});
      const breakdownStr = Object.entries(layerBreakdown)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ");
      void logClientUsageEvent({
        event: "KMZ_CONVERT",
        mode: "pole_survey",
        provider: activeProvider,
        fileName: source.fileName,
        itemCount: placemarks.length,
        summary: `Pole Survey KMZ converted (${poles.length} poles [${breakdownStr}], ${placemarks.length} total objects)`,
      });
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "Unable to convert the selected file.");
    } finally {
      setIsWorking(false);
    }
  }

  async function handleFetchRoads() {
    if (!result) return;
    if (isLicenseExpired()) {
      setError("Software license expired on September 2, 2027. Contact Caesar Ian Samulde for renewal.");
      return;
    }
    if (usageStatus?.revocation?.revoked) {
      setError(usageStatus.revocation.reason || "Software license has been revoked by Caesar Ian Samulde.");
      return;
    }
    setError("");
    setOsmMessage("");
    setIsFetchingRoads(true);
    try {
      const roads = await fetchOpenStreetMapRoads(result.placemarks);
      const existingRoadIds = new Set(result.placemarks.map((placemark) => placemark.id));
      const newRoads = roads.filter((road) => !existingRoadIds.has(road.id));
      const placemarks = [...result.placemarks, ...newRoads];
      const { dxf, zone } = createDxf(
        placemarks,
        result.center,
        `${result.fileName} + OpenStreetMap roads`,
        poleStandard,
        coordinateMode,
        "STANDARD",
        telcoProvider,
        roadStandard,
        cableStandard,
        activeHldProposedNaps,
      );
      setResult({ ...result, placemarks, zone, dxf });
      const roadCount = newRoads.filter((placemark) => placemark.layer === "ROAD_CENTERLINES").length;
      setOsmMessage(
        newRoads.length
          ? `Added ${roadCount} OSM road${roadCount === 1 ? "" : "s"} along the pole and aerial cable corridor (${isPldtProvider(telcoProvider) ? "Blue" : "Yellow"} road labels).`
          : "No new OSM roads were found along the surveyed pole and aerial cable corridor.",
      );
      void logClientUsageEvent({
        event: "OSM_ROADS_FETCH",
        mode: "pole_survey",
        provider: telcoProvider,
        fileName: result.fileName,
        itemCount: roadCount,
        summary: `Fetched ${roadCount} OSM corridor roads for ${result.fileName}`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to fetch nearby road data.");
    } finally {
      setIsFetchingRoads(false);
    }
  }

  async function handleDownloadDwg() {
    if (!result) return;
    if (isLicenseExpired()) {
      setError("Software license expired on September 2, 2027. Contact Caesar Ian Samulde for renewal.");
      return;
    }
    if (usageStatus?.revocation?.revoked) {
      setError(usageStatus.revocation.reason || "Software license has been revoked by Caesar Ian Samulde.");
      return;
    }
    setError("");
    setIsConvertingDwg(true);
    try {
      await downloadDwg(result.fileName, result.dxf, { telcoProvider });
      void logClientUsageEvent({
        event: "EXPORT_DWG",
        mode: "pole_survey",
        provider: telcoProvider,
        fileName: result.fileName,
        itemCount: result.placemarks.length,
        summary: `Exported Pole Survey DWG (${result.placemarks.length} objects)`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create DWG.");
    } finally {
      setIsConvertingDwg(false);
    }
  }

  function updatePoleStandard(update: Partial<PoleStandard>) {
    setPoleStandard((current) => {
      const next = { ...current, ...update };
      if (result) {
        const placemarks = result.placemarks.map((p) => classifyPlacemark(p, telcoProvider, next.electricUtility));
        const { dxf, zone } = createDxf(placemarks, result.center, result.fileName, next, coordinateMode, "STANDARD", telcoProvider, roadStandard, cableStandard, activeHldProposedNaps);
        setResult({ ...result, placemarks, dxf, zone });
      }
      return next;
    });
  }

  function updateRoadStandard(update: Partial<RoadWidthStandard>) {
    setRoadStandard((current) => {
      const next = { ...current, ...update };
      if (result) {
        const { dxf, zone } = createDxf(result.placemarks, result.center, result.fileName, poleStandard, coordinateMode, "STANDARD", telcoProvider, next, cableStandard, activeHldProposedNaps);
        setResult({ ...result, dxf, zone });
      }
      return next;
    });
  }

  function updateCableStandard(update: Partial<CableSpanStandard>) {
    setCableStandard((current) => {
      const next = { ...current, ...update };
      if (result) {
        const { dxf, zone } = createDxf(
          result.placemarks,
          result.center,
          result.fileName,
          poleStandard,
          coordinateMode,
          "STANDARD",
          telcoProvider,
          roadStandard,
          next,
          activeHldProposedNaps,
        );
        setResult({ ...result, dxf, zone });
      }
      return next;
    });
  }

  function updateProposedNapPoleLines(poleId: string, lines: 8 | 16) {
    if (!result) return;
    const nextPlacemarks = result.placemarks.map((p) =>
      p.id === poleId
        ? {
            ...p,
            properties: {
              ...p.properties,
              _napLines: String(lines),
              _excludePropNap: "false",
            },
          }
        : p,
    );
    const { dxf, zone } = createDxf(
      nextPlacemarks,
      result.center,
      result.fileName,
      poleStandard,
      coordinateMode,
      "STANDARD",
      telcoProvider,
      roadStandard,
      cableStandard,
      activeHldProposedNaps,
    );
    setResult({ ...result, placemarks: nextPlacemarks, dxf, zone });
  }

  function toggleExcludeProposedNapPole(poleId: string, exclude: boolean) {
    if (!result) return;
    const nextPlacemarks = result.placemarks.map((p) =>
      p.id === poleId
        ? {
            ...p,
            properties: {
              ...p.properties,
              _excludePropNap: exclude ? "true" : "false",
            },
          }
        : p,
    );
    const { dxf, zone } = createDxf(
      nextPlacemarks,
      result.center,
      result.fileName,
      poleStandard,
      coordinateMode,
      "STANDARD",
      telcoProvider,
      roadStandard,
      cableStandard,
      activeHldProposedNaps,
    );
    setResult({ ...result, placemarks: nextPlacemarks, dxf, zone });
  }

  function batchUpdateProposedNapPoleLines(mode: "all8" | "all16" | "first16rest8") {
    if (!result) return;
    let napIdx = 0;
    const nextPlacemarks = result.placemarks.map((p) => {
      if (p.geometry.type !== "Point" || !hasProposedNapAttribute(p)) return p;
      const lines =
        mode === "all16"
          ? 16
          : mode === "first16rest8"
            ? napIdx === 0
              ? 16
              : 8
            : 8;
      napIdx += 1;
      return {
        ...p,
        properties: {
          ...p.properties,
          _napLines: String(lines),
        },
      };
    });
    const { dxf, zone } = createDxf(
      nextPlacemarks,
      result.center,
      result.fileName,
      poleStandard,
      coordinateMode,
      "STANDARD",
      telcoProvider,
      roadStandard,
      cableStandard,
      activeHldProposedNaps,
    );
    setResult({ ...result, placemarks: nextPlacemarks, dxf, zone });
  }

  function applyHldMatchingToResult(pinsToMatch: HldOverlayPin[]) {
    if (!result || !pinsToMatch.length) return;
    const candidatePins = pinsToMatch.filter((h) => h.status === "PROPOSED" || h.status === "DUMMY");
    const candidates = candidatePins.length ? candidatePins : pinsToMatch;

    const nextPlacemarks = result.placemarks.map((p) => {
      if (p.geometry.type !== "Point" || !hasRawProposedNapAttribute(p)) return p;
      const coord = p.geometry.coordinates;
      let bestPin: HldOverlayPin | null = null;
      let bestDist = Infinity;
      for (const h of candidates) {
        const d = haversineDistance(coord, { lat: h.lat, lon: h.lon });
        if (d < bestDist) {
          bestDist = d;
          bestPin = h;
        }
      }
      if (bestPin && bestDist <= 180) {
        if (bestPin.status === "DUMMY") {
          return {
            ...p,
            properties: {
              ...p.properties,
              _excludePropNap: "true",
              _matchedHldName: `${bestPin.name} (DUMMY NAP)`,
            },
          };
        }
        return {
          ...p,
          properties: {
            ...p.properties,
            _napLines: String(bestPin.lines),
            _excludePropNap: "false",
            _matchedHldName: bestPin.name,
          },
        };
      }
      return p;
    });

    const { dxf, zone } = createDxf(
      nextPlacemarks,
      result.center,
      result.fileName,
      poleStandard,
      coordinateMode,
      "STANDARD",
      telcoProvider,
      roadStandard,
      cableStandard,
      activeHldProposedNaps,
    );
    setResult({ ...result, placemarks: nextPlacemarks, dxf, zone });
  }

  async function handleLoadHldReferenceKmz(file: File) {
    try {
      const source = await readSourceFile(file);
      const parsed = source.kmlTexts.flatMap((kml) => parseKml(kml.text));
      const pins: HldOverlayPin[] = [];
      const refLines: MapOverlayLine[] = [];

      parsed.forEach((p, idx) => {
        const folder = p.properties.Folder || p.properties._folder || "";
        const folderChain = p.properties._folderChain || folder;
        const text = `${p.name} ${p.description} ${folder} ${folderChain} ${Object.values(p.properties).join(" ")}`;
        if (p.geometry.type === "Point") {
          const isDummy = isDummyNapIdentifier(p.name, folder) || isDummyNapFolder(folder) || isDummyNapFolder(folderChain);
          const isExisting = hasExistingNapIdentifier(text) || hasExistingNapIdentifier(folder) || hasExistingNapIdentifier(folderChain);
          const isOlt = /\bolt\b|\bpoi\b/i.test(text) && !isNapEntity(p.name, folder);
          const lines = resolveHldProposedNapLines(p);
          const detectedStatus = detectNapStatus(text, folder);
          const status: "PROPOSED" | "EXISTING" | "DUMMY" | "OLT" = isOlt
            ? "OLT"
            : isDummy || detectedStatus === "DUMMY"
              ? "DUMMY"
              : isExisting || detectedStatus === "EXISTING" || detectedStatus === "SOURCE"
                ? "EXISTING"
                : "PROPOSED";
          pins.push({
            id: `hld-pin-${idx}-${p.id}`,
            name: p.name || `NAP-${idx + 1}`,
            lat: p.geometry.coordinates.lat,
            lon: p.geometry.coordinates.lon,
            lines,
            status,
          });
        } else if (p.geometry.type === "LineString") {
          refLines.push({
            id: `hld-line-${idx}-${p.id}`,
            kind: "hld_route",
            coords: p.geometry.coordinates.map((c) => ({ lat: c.lat, lon: c.lon })),
            label: p.name,
          });
        } else if (p.geometry.type === "Polygon" && p.geometry.coordinates[0]) {
          refLines.push({
            id: `hld-poly-${idx}-${p.id}`,
            kind: "polygon",
            coords: p.geometry.coordinates[0].map((c) => ({ lat: c.lat, lon: c.lon })),
            label: p.name,
          });
        }
      });

      setHldReferencePins(pins);
      setHldReferenceLines(refLines);
      applyHldMatchingToResult(pins);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load HLD reference KMZ.");
    }
  }

  function updateCoordinateMode(nextMode: CoordinateMode) {
    setCoordinateMode(nextMode);
    const isRaw =
      nextMode === "epsg_4326_lat_lon" ||
      nextMode === "epsg_4326_lon_lat" ||
      nextMode === "raw_lat_lon" ||
      nextMode === "raw_lon_lat";
    const baseStandard = isRaw ? rawCoordinatePoleStandard : defaultPoleStandard;
    const nextStandard: PoleStandard = {
      ...baseStandard,
      includeFocCable: poleStandard.includeFocCable,
    };
    setPoleStandard(nextStandard);
    if (result) {
      const { dxf, zone } = createDxf(
        result.placemarks,
        result.center,
        result.fileName,
        nextStandard,
        nextMode,
        "STANDARD",
        telcoProvider,
        roadStandard,
        cableStandard,
        activeHldProposedNaps,
      );
      setResult({ ...result, dxf, zone });
    }
    if (napResult) {
      const { dxf, zone } = createHldNapDxf(
        napResult.placemarks,
        napResult.center,
        napResult.fileName,
        napStandard,
        nextMode,
        "STANDARD",
      );
      setNapResult({ ...napResult, dxf, zone });
    }
  }

  function updateTelcoProvider(nextProvider: TelcoProvider) {
    setTelcoProvider(nextProvider);
    const nextAllowance = isPldtProvider(nextProvider) ? 0.5 : 2.0;
    const nextCableStandard: CableSpanStandard = {
      ...cableStandard,
      allowanceMeters: nextAllowance,
    };
    setCableStandard(nextCableStandard);
    const nextPoleStandard: PoleStandard = {
      ...poleStandard,
      includeFocCable: nextProvider === "globe_mapsme" ? false : true,
    };
    setPoleStandard(nextPoleStandard);
    if (result) {
      const placemarks = result.placemarks.map((p) => classifyPlacemark(p, nextProvider, nextPoleStandard.electricUtility));
      const { dxf, zone } = createDxf(
        placemarks,
        result.center,
        result.fileName,
        nextPoleStandard,
        coordinateMode,
        "STANDARD",
        nextProvider,
        roadStandard,
        nextCableStandard,
        activeHldProposedNaps,
      );
      setResult({ ...result, placemarks, dxf, zone, provider: nextProvider });
    }
  }

  if (usageStatus?.revocation?.revoked) {
    return (
      <div className="eulaDeclinedScreen">
        <div className="eulaDeclinedCard" style={{ borderColor: "#ef4444", maxWidth: "580px" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "16px" }}>
            <ShieldAlert size={52} color="#ef4444" />
          </div>
          <h2 style={{ color: "#ef4444" }}>⛔ Software License Revoked & Terminated</h2>
          <p style={{ fontSize: "0.95rem", lineHeight: 1.6, color: "#e2ece5" }}>
            {usageStatus.revocation.reason ||
              "Access to this software has been remotely revoked by the author and copyright holder, Caesar Ian Samulde. Under Section 3 & 4 of the End User License Agreement (Conditional Employment-Bound License), all company usage rights have immediately terminated."}
          </p>
          <div style={{ background: "#2a1515", border: "1px solid #7f1d1d", borderRadius: "8px", padding: "12px 14px", margin: "16px 0", textAlign: "left", fontSize: "0.82rem", color: "#fca5a5" }}>
            <strong>📋 Automated Audit Telemetry Notice:</strong>
            <p style={{ margin: "4px 0 0", color: "#fecaca" }}>
              This execution attempt on workstation <code>{usageStatus.machine?.hostname}\{usageStatus.machine?.username}</code> (Machine ID: <code>{usageStatus.machine?.machineId}</code>) has been logged and transmitted to the copyright holder's audit server.
            </p>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "14px" }}>
            <span style={{ fontSize: "0.78rem", color: "#8a9e92" }}>
              © 2026 Caesar Ian Samulde. All Rights Reserved.
            </span>
            <button
              type="button"
              onClick={() => {
                void fetchClientUsageStatus(true).then((s) => {
                  if (s) setUsageStatus(s);
                });
              }}
              style={{
                background: "transparent",
                border: "1px solid #475569",
                color: "#94a3b8",
                padding: "5px 10px",
                borderRadius: "6px",
                fontSize: "11px",
                cursor: "pointer",
              }}
            >
              Re-Verify License Status
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isLicenseExpired()) {
    return (
      <div className="eulaDeclinedScreen">
        <div className="eulaDeclinedCard" style={{ borderColor: "#ef4444" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "16px" }}>
            <ShieldAlert size={48} color="#ef4444" />
          </div>
          <h2 style={{ color: "#ef4444" }}>Software License Expired</h2>
          <p style={{ fontSize: "0.95rem", lineHeight: 1.6, color: "#e2ece5" }}>
            This software build reached its built-in 1-year license expiration date on <strong>September 2, 2027</strong>.
          </p>
          <div style={{ background: "#2a1515", border: "1px solid #7f1d1d", borderRadius: "8px", padding: "12px 14px", margin: "16px 0", textAlign: "left", fontSize: "0.85rem", color: "#fca5a5" }}>
            <strong>Renewal & License Inquiries:</strong>
            <p style={{ margin: "4px 0 0", color: "#fecaca" }}>
              Please contact the author and developer <strong>Caesar Ian Samulde</strong> to request an updated build or extend your enterprise license.
            </p>
          </div>
          <div style={{ fontSize: "0.78rem", color: "#8a9e92" }}>
            © 2026 Caesar Ian Samulde. All Rights Reserved.
          </div>
        </div>
      </div>
    );
  }

  if (eulaDeclined) {
    return (
      <div className="eulaDeclinedScreen">
        <div className="eulaDeclinedCard">
          <h2>⚠️ Access Restricted</h2>
          <p>
            You have declined the End User License Agreement (EULA). Usage of this software requires unconditional acceptance of the proprietary terms, copyright policy, and fair use guidelines.
          </p>
          <button
            type="button"
            className="modalAckButton"
            onClick={() => {
              setEulaDeclined(false);
            }}
          >
            Review & Accept License
          </button>
        </div>
      </div>
    );
  }

  return (
    <main>
      <section className="workspace">
        <div className="header">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
              <p className="eyebrow" style={{ margin: 0 }}>FTTH Drafting Utility • © 2026 Caesar Ian Samulde</p>
              <span className="versionBadge">v2.3.0</span>
              <button
                type="button"
                className="changelogButton"
                onClick={() => setShowChangelogModal(true)}
                title="View what is new in version 2.3.0"
              >
                <Sparkles size={12} color="#15803d" />
                <span>What's New</span>
              </button>
            </div>
            <h1>KMZ to AutoCAD Converter</h1>
          </div>
          <div className="status">
            <MapPinned size={16} />
            {formatProviderLabel(telcoProvider)} Standard •{" "}
            {coordinateMode === "mercator"
              ? "EPSG:3395 (World Mercator)"
              : coordinateMode === "epsg_3857"
                ? "EPSG:3857 (Pseudo-Mercator)"
                : coordinateMode === "utm"
                  ? "UTM Scale (m)"
                  : coordinateMode === "epsg_4326_lat_lon" || coordinateMode === "raw_lat_lon"
                    ? "EPSG:4326 (Lat / Lon)"
                    : "EPSG:4326 (Lon / Lat)"}
          </div>
        </div>

        {/* Top-Level Converter Mode Switcher */}
        <div className="modeTabs">
          <button
            type="button"
            className={`modeTab ${converterMode === "pole_survey" ? "active" : ""}`}
            onClick={() => setConverterMode("pole_survey")}
          >
            <span>⚡</span>
            <span>Pole & Road Survey Converter</span>
          </button>
          <button
            type="button"
            className={`modeTab ${converterMode === "hld_nap" ? "active" : ""}`}
            onClick={() => setConverterMode("hld_nap")}
          >
            <span>🌐</span>
            <span>HLD NAP & Stencil Converter</span>
          </button>
          <button
            type="button"
            className={`modeTab ${converterMode === "excel_pic" ? "active" : ""}`}
            onClick={() => setConverterMode("excel_pic")}
          >
            <span>📸</span>
            <span>Survey Photo to Excel (excelPic)</span>
          </button>
        </div>

        {converterMode === "excel_pic" ? (
          <ExcelPicConverter />
        ) : converterMode === "hld_nap" ? (
          <div className="shell">
            {/* Top-Left: HLD Settings & Dropzone */}
            <div className="uploadArea">
              {/* Telco Provider Standard Switcher for HLD */}
              <div style={{ marginBottom: "12px", background: "var(--bg-elevated)", border: "1px solid var(--border-soft)", borderRadius: "10px", padding: "10px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-main)" }}>Select Telco Standard:</span>
                  <span style={{ fontSize: "12px", fontWeight: 600, color: napStandard.telcoProvider === "pldt" ? "#dc2626" : "#2563eb" }}>
                    {napStandard.telcoProvider === "pldt" ? "PLDT / Smart Standard" : "Globe Telecom (Official Stencil)"}
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  <button
                    type="button"
                    onClick={() => updateNapStandard({ telcoProvider: "globe" })}
                    style={{
                      padding: "9px 12px",
                      borderRadius: "8px",
                      border: napStandard.telcoProvider === "globe" ? "2px solid #2563eb" : "1px solid var(--border-soft)",
                      background: napStandard.telcoProvider === "globe" ? "rgba(37, 99, 235, 0.12)" : "var(--bg-panel)",
                      color: napStandard.telcoProvider === "globe" ? "#2563eb" : "var(--text-main)",
                      fontWeight: napStandard.telcoProvider === "globe" ? 700 : 500,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                      fontSize: "12px",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <span>🔵</span>
                    <span>Globe Telecom (Official Stencil)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => updateNapStandard({ telcoProvider: "pldt" })}
                    style={{
                      padding: "9px 12px",
                      borderRadius: "8px",
                      border: napStandard.telcoProvider === "pldt" ? "2px solid #dc2626" : "1px solid var(--border-soft)",
                      background: napStandard.telcoProvider === "pldt" ? "rgba(220, 38, 38, 0.12)" : "var(--bg-panel)",
                      color: napStandard.telcoProvider === "pldt" ? "#dc2626" : "var(--text-main)",
                      fontWeight: napStandard.telcoProvider === "pldt" ? 700 : 500,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                      fontSize: "12px",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <span>🔴</span>
                    <span>PLDT / Smart</span>
                  </button>
                </div>
              </div>

              {/* HLD Parameters & Stencil Style */}
              <div className="panel" style={{ marginBottom: "12px", padding: "14px 16px" }}>
                <div className="panelTitle" style={{ fontSize: "14px", fontWeight: 700, marginBottom: "12px" }}>
                  <Settings2 size={16} />
                  HLD NAP & Stencil Parameters
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", fontSize: "13px" }}>
                  <div>
                    <label style={{ display: "block", fontWeight: 600, marginBottom: "4px", color: "var(--text-muted)" }}>
                      Stencil Block Style
                    </label>
                    <select
                      value={napStandard.stencilStyle}
                      onChange={(e) => updateNapStandard({ stencilStyle: e.target.value as any })}
                      style={{ width: "100%", padding: "7px 10px", borderRadius: "6px", border: "1px solid var(--border-soft)", background: "var(--bg-input)" }}
                    >
                      <option value="telcoBlock">Owner Telco Stencil Block (Globe Standard / 16-Lines)</option>
                      <option value="lines8p">8 Lines Stencil (Globe Dual Bracket 8P)</option>
                      <option value="box8p">8-Port Terminal Box (NAP_8PORT)</option>
                      <option value="hex16p">16-Port Terminal Enclosure (NAP_16PORT)</option>
                      <option value="splitter">Splitter Symbol (NAP_SPLITTER)</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: "block", fontWeight: 600, marginBottom: "4px", color: "var(--text-muted)" }}>
                      Default Splitter
                    </label>
                    <select
                      value={napStandard.defaultSplitter}
                      onChange={(e) => updateNapStandard({ defaultSplitter: e.target.value as NapSplitter })}
                      style={{ width: "100%", padding: "7px 10px", borderRadius: "6px", border: "1px solid var(--border-soft)", background: "var(--bg-input)" }}
                    >
                      <option value="1:8">1:8 Splitter (8 Ports)</option>
                      <option value="1:16">1:16 Splitter (16 Ports)</option>
                      <option value="1:4">1:4 Splitter (4 Ports)</option>
                      <option value="2:8">2:8 Dual Splitter (8 Ports)</option>
                      <option value="1:32">1:32 Splitter (32 Ports)</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: "block", fontWeight: 600, marginBottom: "4px", color: "var(--text-muted)" }}>
                      Aerial FOC Cable Spec
                    </label>
                    <select
                      value={napStandard.focFiberCount || "12F"}
                      onChange={(e) => updateNapStandard({ focFiberCount: e.target.value })}
                      style={{ width: "100%", padding: "7px 10px", borderRadius: "6px", border: "1px solid var(--border-soft)", background: "var(--bg-input)" }}
                    >
                      <option value="12F">12-Core FOC Cable (PROP. 12FOC)</option>
                      <option value="24F">24-Core FOC Cable (PROP. 24FOC)</option>
                      <option value="48F">48-Core FOC Cable (PROP. 48FOC)</option>
                      <option value="72F">72-Core FOC Cable (PROP. 72FOC)</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: "block", fontWeight: 600, marginBottom: "4px", color: "var(--text-muted)" }}>
                      Auto-generate FOC Cable
                    </label>
                    <div style={{ display: "flex", gap: "6px", alignItems: "center", height: "35px" }}>
                      <label style={{ fontSize: "13px", display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontWeight: 600 }}>
                        <input
                          type="checkbox"
                          checked={napStandard.autoGenerateFocCable !== false}
                          onChange={(e) => updateNapStandard({ autoGenerateFocCable: e.target.checked })}
                        />
                        Auto Route along NAPs & Closures
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              {/* Dropzone */}
              <label className="dropzone">
                <input
                  type="file"
                  multiple
                  accept=".kmz,.kml,application/vnd.google-earth.kmz,application/vnd.google-earth.kml+xml"
                  onChange={(event) => {
                    const files = event.target.files;
                    if (files && files.length > 0) void handleNapFile(files);
                  }}
                />
                <UploadCloud size={38} color="#0284c7" />
                <span>{isWorking ? "Reading HLD / Survey data..." : "Drop or select HLD KMZ (or HLD + Pole Survey together)"}</span>
                <small>Auto-extracts NAPs and surveyed poles, and generates P-AERIAL_FOC cable with vertices on the road at every pole/NAP.</small>
              </label>

              {napResult && (
                <div className="panel" style={{ marginTop: "14px" }}>
                  <div className="panelTitle">
                    <FileArchive size={18} />
                    Loaded HLD File
                  </div>
                  <div className="facts">
                    <div>
                      <span>File</span>
                      <strong>{napResult.fileName}</strong>
                    </div>
                    <div>
                      <span>Provider Standard</span>
                      <strong style={{ color: napStandard.telcoProvider === "pldt" ? "#dc2626" : "#2563eb" }}>
                        {napStandard.telcoProvider === "pldt" ? "PLDT / Smart Standard" : "Globe Telecom Standard"}
                      </strong>
                    </div>
                    <div>
                      <span>Classified NAPs</span>
                      <strong style={{ color: "#0284c7" }}>{napResult.naps.length} NAPs</strong>
                    </div>
                    <div>
                      <span>Feeder / Route Lines</span>
                      <strong>{napCounts?.feedersCount || 0} lines</strong>
                    </div>
                    <div>
                      <span>Projection</span>
                      <strong>
                        {coordinateMode === "utm"
                          ? `UTM Zone ${napResult.zone} (Meters)`
                          : coordinateMode === "mercator"
                            ? "WGS 84 / World Mercator (EPSG:3395)"
                            : coordinateMode === "epsg_3857"
                              ? "WGS 84 / Pseudo-Mercator (EPSG:3857)"
                              : coordinateMode === "epsg_4326_lat_lon" || coordinateMode === "raw_lat_lon"
                                ? "WGS 84 (EPSG:4326) — Lat, Lon"
                                : "WGS 84 (EPSG:4326) — Lon, Lat"}
                      </strong>
                    </div>
                    <div>
                      <span>Center Lon / Lat</span>
                      <strong>{napResult.center.lon.toFixed(6)}, {napResult.center.lat.toFixed(6)}</strong>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right Column: Actions & Schedule */}
            <div className="contentArea">
              {error && <div className="errorBanner">{error}</div>}

              {napResult ? (
                <>
                  {/* Action Buttons */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "10px", marginBottom: "16px" }}>
                    <button
                      type="button"
                      className="primaryButton"
                      onClick={() => {
                        const blob = new Blob([napResult.dxf], { type: "application/dxf" });
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement("a");
                        link.href = url;
                        link.download = `${safeDownloadBase(napResult.fileName)}-hld-naps.dxf`;
                        link.click();
                        URL.revokeObjectURL(url);
                        void logClientUsageEvent({
                          event: "EXPORT_DXF",
                          mode: "hld_nap",
                          provider: napStandard.telcoProvider,
                          fileName: napResult.fileName,
                          itemCount: napResult.naps.length,
                          summary: `Exported HLD NAP DXF (${napResult.naps.length} NAPs)`,
                        });
                      }}
                    >
                      <Download size={16} />
                      Download HLD DXF
                    </button>

                    <button
                      type="button"
                      className="primaryButton"
                      style={{ background: "#059669", borderColor: "#059669" }}
                      onClick={() => {
                        downloadText(`${safeDownloadBase(napResult.fileName)}-hld-nap-${napStandard.telcoProvider}.dxf`, napResult.dxf);
                        void logClientUsageEvent({
                          event: "EXPORT_DXF",
                          mode: "hld_nap",
                          provider: napStandard.telcoProvider,
                          fileName: napResult.fileName,
                          itemCount: napResult.naps.length,
                          summary: `Exported HLD NAP DXF (${napResult.naps.length} NAPs)`,
                        });
                      }}
                    >
                      <Download size={16} />
                      Download HLD DXF (AutoCAD Ready)
                    </button>

                    <button
                      type="button"
                      className={isStaticWeb ? "secondaryButton" : "primaryButton"}
                      style={
                        isStaticWeb
                          ? undefined
                          : { background: napStandard.telcoProvider === "pldt" ? "#dc2626" : "#2563eb", borderColor: napStandard.telcoProvider === "pldt" ? "#dc2626" : "#2563eb" }
                      }
                      disabled={isConvertingNapDwg}
                      onClick={() => void handleDownloadNapDwg()}
                      title={isStaticWeb ? "Direct .DWG requires local desktop app" : undefined}
                    >
                      <Download size={16} />
                      {isConvertingNapDwg ? "Generating DWG..." : `Download ${napStandard.telcoProvider === "pldt" ? "PLDT" : "Globe"} DWG ${isStaticWeb ? "(Desktop App)" : ""}`}
                    </button>

                    <button
                      type="button"
                      className="secondaryButton"
                      onClick={handleDownloadNapCsv}
                    >
                      <FileText size={16} />
                      Export NAP CSV Schedule
                    </button>

                    <button
                      type="button"
                      className="secondaryButton"
                      onClick={() => {
                        const html = hldNapPreviewHtml(napResult, napStandard);
                        openPreviewTab(html);
                      }}
                    >
                      <Route size={16} />
                      Interactive HLD Map Preview
                    </button>
                  </div>

                  {/* Summary Metric Cards */}
                  {napCounts && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: "8px", marginBottom: "16px" }}>
                      <div className="panel" style={{ padding: "10px 12px", textAlign: "center" }}>
                        <span style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase" }}>Total NAPs</span>
                        <div style={{ fontSize: "18px", fontWeight: 800, color: "var(--text-main)" }}>{napCounts.totalNaps}</div>
                      </div>
                      <div className="panel" style={{ padding: "10px 12px", textAlign: "center" }}>
                        <span style={{ fontSize: "11px", color: "#dc2626", textTransform: "uppercase" }}>Proposed</span>
                        <div style={{ fontSize: "18px", fontWeight: 800, color: "#dc2626" }}>{napCounts.proposed}</div>
                      </div>
                      {napCounts.existing > 0 && (
                        <div className="panel" style={{ padding: "10px 12px", textAlign: "center" }}>
                          <span style={{ fontSize: "11px", color: "#2563eb", textTransform: "uppercase" }}>Existing</span>
                          <div style={{ fontSize: "18px", fontWeight: 800, color: "#2563eb" }}>{napCounts.existing}</div>
                          {napCounts.existingDummy > 0 && (
                            <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "2px" }}>
                              {napCounts.existingNaps} NAPs • {napCounts.existingDummy} Dummy
                            </div>
                          )}
                        </div>
                      )}
                      <div className="panel" style={{ padding: "10px 12px", textAlign: "center" }}>
                        <span style={{ fontSize: "11px", color: "#0284c7", textTransform: "uppercase" }}>Vetted</span>
                        <div style={{ fontSize: "18px", fontWeight: 800, color: "#0284c7" }}>{napCounts.vetted}</div>
                      </div>
                      <div className="panel" style={{ padding: "10px 12px", textAlign: "center" }}>
                        <span style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase" }}>Source/FDH</span>
                        <div style={{ fontSize: "18px", fontWeight: 800, color: "#64748b" }}>{napCounts.source}</div>
                      </div>
                      {napCounts.dummy > 0 && (
                        <div className="panel" style={{ padding: "10px 12px", textAlign: "center" }}>
                          <span style={{ fontSize: "11px", color: "#d97706", textTransform: "uppercase" }}>Dummy</span>
                          <div style={{ fontSize: "18px", fontWeight: 800, color: "#d97706" }}>{napCounts.dummy}</div>
                        </div>
                      )}
                      <div className="panel" style={{ padding: "10px 12px", textAlign: "center" }}>
                        <span style={{ fontSize: "11px", color: "#7c3aed", textTransform: "uppercase" }}>1:8 (8P)</span>
                        <div style={{ fontSize: "18px", fontWeight: 800, color: "#7c3aed" }}>{napCounts.splitters["1:8"] || 0}</div>
                      </div>
                      <div className="panel" style={{ padding: "10px 12px", textAlign: "center" }}>
                        <span style={{ fontSize: "11px", color: "#db2777", textTransform: "uppercase" }}>1:16 (16P)</span>
                        <div style={{ fontSize: "18px", fontWeight: 800, color: "#db2777" }}>{napCounts.splitters["1:16"] || 0}</div>
                      </div>
                    </div>
                  )}

                  {/* NAP Schedule Table */}
                  <div className="panel" style={{ padding: "16px" }}>
                    <div className="panelTitle" style={{ marginBottom: "12px", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <Layers3 size={18} />
                        HLD Network Access Point (NAP) Schedule
                      </div>
                      <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                        {napResult.naps.length} NAPs in Project
                      </span>
                    </div>

                    <div style={{ overflowX: "auto", maxHeight: "420px", overflowY: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                        <thead>
                          <tr style={{ background: "var(--bg-elevated)", borderBottom: "2px solid var(--border-soft)", textAlign: "left" }}>
                            <th style={{ padding: "8px 10px" }}>#</th>
                            <th style={{ padding: "8px 10px" }}>NAP Identifier</th>
                            <th style={{ padding: "8px 10px" }}>AutoCAD Layer</th>
                            <th style={{ padding: "8px 10px" }}>Splitter Ratio</th>
                            <th style={{ padding: "8px 10px" }}>Status</th>
                            <th style={{ padding: "8px 10px" }}>Pole Ref</th>
                            <th style={{ padding: "8px 10px" }}>Feeder</th>
                            <th style={{ padding: "8px 10px" }}>Latitude</th>
                            <th style={{ padding: "8px 10px" }}>Longitude</th>
                          </tr>
                        </thead>
                        <tbody>
                          {napResult.naps.map((nap, idx) => {
                            const pt = nap.geometry.type === "Point" ? nap.geometry.coordinates : { lon: 0, lat: 0 };
                            return (
                              <tr key={nap.id || idx} style={{ borderBottom: "1px solid var(--border-soft)" }}>
                                <td style={{ padding: "8px 10px", color: "var(--text-muted)" }}>{idx + 1}</td>
                                <td style={{ padding: "8px 10px", fontWeight: 700 }}>{nap.napId}</td>
                                <td style={{ padding: "8px 10px" }}>
                                  <span style={{
                                    display: "inline-block",
                                    padding: "2px 6px",
                                    borderRadius: "4px",
                                    fontSize: "11px",
                                    fontWeight: 600,
                                    fontFamily: "monospace",
                                    background: nap.status === "EXISTING" ? "rgba(37, 99, 235, 0.1)" : "rgba(220, 38, 38, 0.1)",
                                    color: nap.status === "EXISTING" ? "#2563eb" : "#dc2626",
                                    border: `1px solid ${nap.status === "EXISTING" ? "rgba(37, 99, 235, 0.3)" : "rgba(220, 38, 38, 0.3)"}`,
                                  }}>
                                    {nap.layer}
                                  </span>
                                </td>
                                <td style={{ padding: "8px 10px" }}>
                                  <span className="napSplitterBadge">
                                    {nap.isDummy ? "Dummy NAP" : `${nap.splitter} (${nap.ports}P)`}
                                  </span>
                                </td>
                                <td style={{ padding: "8px 10px" }}>
                                  <span className={`napBadge ${nap.status === "EXISTING" && nap.isDummy ? "existing-dummy" : nap.status.toLowerCase()}`}>
                                    {nap.status === "EXISTING" ? (nap.isDummy ? "EXISTING DUMMY" : "SOURCE EXISTING NAP") : nap.status}
                                  </span>
                                </td>
                                <td style={{ padding: "8px 10px" }}>{nap.poleRef || "-"}</td>
                                <td style={{ padding: "8px 10px" }}>{nap.feederRef || "-"}</td>
                                <td style={{ padding: "8px 10px", fontFamily: "monospace", fontSize: "12px" }}>{pt.lat.toFixed(6)}</td>
                                <td style={{ padding: "8px 10px", fontFamily: "monospace", fontSize: "12px" }}>{pt.lon.toFixed(6)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : (
                <div className="panel" style={{ padding: "48px 24px", textAlign: "center", color: "var(--text-muted)" }}>
                  <MapPinned size={48} style={{ opacity: 0.3, marginBottom: "12px" }} />
                  <h3 style={{ margin: "0 0 6px", color: "var(--text-main)" }}>No HLD Map Loaded</h3>
                  <p style={{ margin: 0, fontSize: "14px" }}>
                    Drop or select a KMZ/KML file containing Network Access Points (NAPs) to generate telco standard blocks, drop coverage boundaries, and feeder cable routes.
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="shell">
          {/* Top-Left: Dropzone & File info */}
          <div className="uploadArea">
            {/* Telco Provider Standard Switcher */}
            <div style={{ marginBottom: "12px", background: "var(--bg-elevated)", border: "1px solid var(--border-soft)", borderRadius: "10px", padding: "10px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-main)" }}>Select Telco Standard:</span>
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color: telcoProvider === "pldt" ? "#dc2626" : telcoProvider === "pldt_legacy" ? "#ea580c" : telcoProvider === "globe_mapsme" ? "#0284c7" : "#2563eb",
                  }}
                >
                  {formatProviderLabel(telcoProvider)} Active
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                <button
                  type="button"
                  onClick={() => updateTelcoProvider("globe")}
                  title="Standard Globe ISDP structured KMZ converter"
                  style={{
                    padding: "9px 10px",
                    borderRadius: "8px",
                    border: telcoProvider === "globe" ? "2px solid #2563eb" : "1px solid var(--border-soft)",
                    background: telcoProvider === "globe" ? "rgba(37, 99, 235, 0.12)" : "var(--bg-panel)",
                    color: telcoProvider === "globe" ? "#2563eb" : "var(--text-main)",
                    fontWeight: telcoProvider === "globe" ? 700 : 500,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "5px",
                    fontSize: "12.5px",
                    transition: "all 0.15s ease"
                  }}
                >
                  <span>🔵</span>
                  <span>Globe (ISDP)</span>
                </button>
                <button
                  type="button"
                  onClick={() => updateTelcoProvider("globe_mapsme")}
                  title="Globe Maps.me unstructured pole KMZ converter (e.g. 1202751cc9, ptnptcc9, p7, p9)"
                  style={{
                    padding: "9px 10px",
                    borderRadius: "8px",
                    border: telcoProvider === "globe_mapsme" ? "2px solid #0284c7" : "1px solid var(--border-soft)",
                    background: telcoProvider === "globe_mapsme" ? "rgba(2, 132, 199, 0.12)" : "var(--bg-panel)",
                    color: telcoProvider === "globe_mapsme" ? "#0284c7" : "var(--text-main)",
                    fontWeight: telcoProvider === "globe_mapsme" ? 700 : 500,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "5px",
                    fontSize: "12.5px",
                    transition: "all 0.15s ease"
                  }}
                >
                  <span>🌐</span>
                  <span>Globe (Maps.me)</span>
                </button>
                <button
                  type="button"
                  onClick={() => updateTelcoProvider("pldt")}
                  title="New PLDT / Smart Structured KMZ converter (e.g. 63306_poles_with_photos)"
                  style={{
                    padding: "9px 10px",
                    borderRadius: "8px",
                    border: telcoProvider === "pldt" ? "2px solid #dc2626" : "1px solid var(--border-soft)",
                    background: telcoProvider === "pldt" ? "rgba(220, 38, 38, 0.12)" : "var(--bg-panel)",
                    color: telcoProvider === "pldt" ? "#dc2626" : "var(--text-main)",
                    fontWeight: telcoProvider === "pldt" ? 700 : 500,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "5px",
                    fontSize: "12.5px",
                    transition: "all 0.15s ease"
                  }}
                >
                  <span>🔴</span>
                  <span>PLDT (Structured)</span>
                </button>
                <button
                  type="button"
                  onClick={() => updateTelcoProvider("pldt_legacy")}
                  title="Legacy PLDT / Smart unstructured single-line KMZ converter"
                  style={{
                    padding: "9px 10px",
                    borderRadius: "8px",
                    border: telcoProvider === "pldt_legacy" ? "2px solid #ea580c" : "1px solid var(--border-soft)",
                    background: telcoProvider === "pldt_legacy" ? "rgba(234, 88, 12, 0.12)" : "var(--bg-panel)",
                    color: telcoProvider === "pldt_legacy" ? "#ea580c" : "var(--text-main)",
                    fontWeight: telcoProvider === "pldt_legacy" ? 700 : 500,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "5px",
                    fontSize: "12.5px",
                    transition: "all 0.15s ease"
                  }}
                >
                  <span>🟠</span>
                  <span>PLDT (Legacy)</span>
                </button>
              </div>
            </div>

            <label className="dropzone">
              <input
                type="file"
                multiple
                accept=".kmz,.kml,application/vnd.google-earth.kmz,application/vnd.google-earth.kml+xml"
                onChange={(event) => {
                  const files = event.target.files;
                  if (files && files.length > 0) void handleFile(files);
                }}
              />
              <UploadCloud size={38} color="#15803d" />
              <span>{isWorking ? "Reading map data..." : "Drop or select KMZ / KML (or multiple files)"}</span>
              <small>Converts survey poles and routes into native AutoCAD DWG with standardized stencils.</small>
            </label>

            {/* HLD Reference Attachment (Source of Truth for Proposed NAPs) */}
            <div
              className="panel"
              style={{
                marginTop: "12px",
                padding: "12px 14px",
                border: attachedHldFileName || activeHldProposedNaps.length > 0 ? "1.5px solid #16a34a" : "1px dashed var(--border-soft)",
                background: attachedHldFileName || activeHldProposedNaps.length > 0 ? "rgba(22, 163, 74, 0.05)" : "var(--bg-elevated)",
                borderRadius: "8px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                <div style={{ flex: "1 1 220px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: 700, fontSize: "13px" }}>
                    <MapPin size={16} color={attachedHldFileName || activeHldProposedNaps.length > 0 ? "#16a34a" : "#0284c7"} />
                    <span>HLD Proposed NAPs (Source of Truth for Res Lot Boxes)</span>
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "3px" }}>
                    {attachedHldFileName ? (
                      <span style={{ color: "#16a34a", fontWeight: 600 }}>
                        ✅ Attached HLD: {attachedHldFileName} ({activeHldProposedNaps.length} Proposed NAPs). Conflicting pole survey attributes are bypassed.
                      </span>
                    ) : activeHldProposedNaps.length > 0 ? (
                      <span style={{ color: "#0284c7", fontWeight: 600 }}>
                        ℹ️ Using {activeHldProposedNaps.length} Proposed NAPs from loaded HLD as the source of truth for residential lot boxes.
                      </span>
                    ) : (
                      <span>Attach HLD KMZ so Res Lot Boxes are strictly placed from HLD locations without reading old pole attributes.</span>
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                  <label
                    className="secondaryButton"
                    style={{
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "6px 12px",
                      fontSize: "12px",
                      margin: 0,
                    }}
                  >
                    <UploadCloud size={14} />
                    <span>{attachedHldFileName ? "Replace HLD" : "Attach HLD KMZ"}</span>
                    <input
                      type="file"
                      accept=".kmz,.kml,application/vnd.google-earth.kmz,application/vnd.google-earth.kml+xml"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void handleAttachHldKmz(file);
                        e.target.value = "";
                      }}
                    />
                  </label>

                  {attachedHldFileName && (
                    <button
                      type="button"
                      className="secondaryButton"
                      style={{ padding: "6px 10px", fontSize: "12px", color: "#dc2626" }}
                      onClick={() => {
                        setHldNapsSource([]);
                        setAttachedHldFileName("");
                        if (result) {
                          const { dxf, zone } = createDxf(
                            result.placemarks,
                            result.center,
                            result.fileName,
                            poleStandard,
                            coordinateMode,
                            "STANDARD",
                            telcoProvider,
                            roadStandard,
                            cableStandard,
                            [],
                          );
                          setResult({ ...result, dxf, zone });
                        }
                      }}
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            </div>

            {result && (
              <div className="panel" style={{ marginTop: "14px" }}>
                <div className="panelTitle">
                  <FileArchive size={18} />
                  Loaded File
                </div>
                <div className="facts">
                  <div>
                    <span>File</span>
                    <strong>{result.fileName}</strong>
                  </div>
                  <div>
                    <span>Provider Standard</span>
                    <strong style={{ color: telcoProvider === "pldt" ? "#dc2626" : telcoProvider === "pldt_legacy" ? "#ea580c" : "#2563eb" }}>
                      {formatProviderLabel(telcoProvider)} Standard
                    </strong>
                  </div>
                  <div>
                    <span>Total Objects</span>
                    <strong>{result.placemarks.length} items</strong>
                  </div>
                  <div>
                    <span>Projection</span>
                    <strong>
                      {coordinateMode === "utm"
                        ? `UTM Zone ${result.zone} (Meters)`
                        : coordinateMode === "mercator"
                          ? "WGS 84 / World Mercator (EPSG:3395)"
                          : coordinateMode === "epsg_3857"
                            ? "WGS 84 / Pseudo-Mercator (EPSG:3857)"
                            : coordinateMode === "epsg_4326_lat_lon" || coordinateMode === "raw_lat_lon"
                              ? "WGS 84 (EPSG:4326) — Lat, Lon (deg)"
                              : "WGS 84 (EPSG:4326) — Lon, Lat (deg)"}
                    </strong>
                  </div>
                  <div>
                    <span>Center Lon / Lat</span>
                    <strong>{result.center.lon.toFixed(6)}, {result.center.lat.toFixed(6)}</strong>
                  </div>
                  <div>
                    <span>CAD Center (X, Y)</span>
                    <strong>
                      {(() => {
                        const pt =
                          coordinateMode === "mercator"
                            ? lonLatToWgs84Mercator(result.center)
                            : coordinateMode === "epsg_3857"
                              ? lonLatToPseudoMercator(result.center)
                              : coordinateMode === "utm"
                                ? lonLatToUtm(result.center, result.zone)
                                : coordinateMode === "epsg_4326_lat_lon" || coordinateMode === "raw_lat_lon"
                                  ? latLonToRawCad(result.center)
                                  : lonLatToRawCad(result.center);
                        const decimals =
                          coordinateMode.includes("4326") || coordinateMode.includes("raw") ? 6 : 2;
                        return `${pt.x.toFixed(decimals)}, ${pt.y.toFixed(decimals)}`;
                      })()}
                    </strong>
                  </div>
                </div>

                {activeHldProposedNaps.length > 0 ? (() => {
                  const count16 = activeHldProposedNaps.filter((n) => n.napLines === 16).length;
                  const count8 = activeHldProposedNaps.length - count16;
                  return (
                    <div
                      style={{
                        marginTop: "14px",
                        paddingTop: "12px",
                        borderTop: "1px solid var(--border-soft)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "8px",
                          flexWrap: "wrap",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <MapPin size={16} color="#16a34a" />
                          <strong style={{ fontSize: "13px", color: "var(--text-main)" }}>
                            HLD Proposed NAPs ({activeHldProposedNaps.length})
                          </strong>
                        </div>
                        <div style={{ display: "flex", gap: "6px", fontSize: "11.5px", fontWeight: 700 }}>
                          <span
                            style={{
                              padding: "2px 8px",
                              borderRadius: "999px",
                              background: "rgba(21, 128, 61, 0.14)",
                              color: "#15803d",
                            }}
                          >
                            8-Lines (10 Lots): {count8}
                          </span>
                          <span
                            style={{
                              padding: "2px 8px",
                              borderRadius: "999px",
                              background: "rgba(37, 99, 235, 0.14)",
                              color: "#2563eb",
                            }}
                          >
                            16-Lines (16 Lots): {count16}
                          </span>
                        </div>
                      </div>

                      <div style={{ fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.4 }}>
                        Source of Truth: Sourced strictly from the <strong>PROPOSED NAP</strong> folder in the HLD file. Pole survey attributes are bypassed.
                      </div>
                    </div>
                  );
                })() : (
                  <div
                    style={{
                      marginTop: "14px",
                      paddingTop: "12px",
                      borderTop: "1px solid var(--border-soft)",
                      fontSize: "12px",
                      color: "var(--text-muted)",
                      lineHeight: 1.4,
                    }}
                  >
                    <span>Attach your HLD KMZ above to generate Residential Lot Boxes at Proposed NAP locations.</span>
                  </div>
                )}
              </div>
            )}

            {error && <p className="error">{error}</p>}
          </div>

          {/* Top-Right: Output & Download Actions */}
          <div className="panel outputPanel">
            <div className="panelTitle">
              <Download size={18} />
              AutoCAD Export
            </div>

            {/* Provider Standard Selector (Globe vs PLDT Structured vs PLDT Legacy) */}
            <div style={{ marginBottom: "14px" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "13px", fontWeight: 600, color: "var(--text-main)" }}>
                <span>Telco Provider Standard:</span>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  <button
                    type="button"
                    onClick={() => updateTelcoProvider("globe")}
                    title="Standard Globe ISDP structured KMZ converter"
                    style={{
                      padding: "10px 10px",
                      borderRadius: "8px",
                      border: telcoProvider === "globe" ? "2px solid #2563eb" : "1px solid var(--border-soft)",
                      background: telcoProvider === "globe" ? "rgba(37, 99, 235, 0.12)" : "var(--bg-elevated)",
                      color: telcoProvider === "globe" ? "#2563eb" : "var(--text-main)",
                      fontWeight: telcoProvider === "globe" ? 700 : 500,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                      fontSize: "12.5px",
                      transition: "all 0.15s ease"
                    }}
                  >
                    <span style={{ fontSize: "14px" }}>🔵</span>
                    <span>Globe (ISDP)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => updateTelcoProvider("globe_mapsme")}
                    title="Globe Maps.me unstructured pole KMZ converter (e.g. 1202751cc9, ptnptcc9, p7, p9)"
                    style={{
                      padding: "10px 10px",
                      borderRadius: "8px",
                      border: telcoProvider === "globe_mapsme" ? "2px solid #0284c7" : "1px solid var(--border-soft)",
                      background: telcoProvider === "globe_mapsme" ? "rgba(2, 132, 199, 0.12)" : "var(--bg-elevated)",
                      color: telcoProvider === "globe_mapsme" ? "#0284c7" : "var(--text-main)",
                      fontWeight: telcoProvider === "globe_mapsme" ? 700 : 500,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                      fontSize: "12.5px",
                      transition: "all 0.15s ease"
                    }}
                  >
                    <span style={{ fontSize: "14px" }}>🌐</span>
                    <span>Globe (Maps.me)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => updateTelcoProvider("pldt")}
                    title="PLDT / Smart Structured KMZ (HTML Table & Bullet-separated Pole Name)"
                    style={{
                      padding: "10px 10px",
                      borderRadius: "8px",
                      border: telcoProvider === "pldt" ? "2px solid #dc2626" : "1px solid var(--border-soft)",
                      background: telcoProvider === "pldt" ? "rgba(220, 38, 38, 0.12)" : "var(--bg-elevated)",
                      color: telcoProvider === "pldt" ? "#dc2626" : "var(--text-main)",
                      fontWeight: telcoProvider === "pldt" ? 700 : 500,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                      fontSize: "12.5px",
                      transition: "all 0.15s ease"
                    }}
                  >
                    <span style={{ fontSize: "14px" }}>🔴</span>
                    <span>PLDT (Structured)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => updateTelcoProvider("pldt_legacy")}
                    title="PLDT / Smart Legacy KMZ (Unstructured single-line pole labels)"
                    style={{
                      padding: "10px 10px",
                      borderRadius: "8px",
                      border: telcoProvider === "pldt_legacy" ? "2px solid #ea580c" : "1px solid var(--border-soft)",
                      background: telcoProvider === "pldt_legacy" ? "rgba(234, 88, 12, 0.12)" : "var(--bg-elevated)",
                      color: telcoProvider === "pldt_legacy" ? "#ea580c" : "var(--text-main)",
                      fontWeight: telcoProvider === "pldt_legacy" ? 700 : 500,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                      fontSize: "12.5px",
                      transition: "all 0.15s ease"
                    }}
                  >
                    <span style={{ fontSize: "14px" }}>🟠</span>
                    <span>PLDT (Legacy)</span>
                  </button>
                </div>
              </label>
            </div>

            {result ? (
              <div>
                <div style={{ marginBottom: "14px" }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "13px", fontWeight: 600, color: "var(--text-main)" }}>
                    <span>Coordinate System:</span>
                    <select
                      value={coordinateMode}
                      onChange={(event) => updateCoordinateMode(event.target.value as CoordinateMode)}
                      style={{
                        padding: "9px 12px",
                        borderRadius: "8px",
                        border: "1px solid var(--border-soft)",
                        background: "var(--bg-elevated)",
                        color: "var(--text-main)",
                        fontSize: "13.5px",
                        fontWeight: 500,
                        cursor: "pointer"
                      }}
                    >
                      <option value="mercator">Company Standard: WGS 84 / World Mercator (EPSG:3395)</option>
                      <option value="epsg_3857">Web Mercator: WGS 84 / Pseudo-Mercator (EPSG:3857)</option>
                      <option value="epsg_4326_lat_lon">Raw Degrees: WGS 84 (EPSG:4326) — X Lat, Y Lon</option>
                      <option value="epsg_4326_lon_lat">Raw Degrees: WGS 84 (EPSG:4326) — X Lon, Y Lat</option>
                      <option value="utm">Actual Scale: WGS 84 / UTM Zone 51N (Ground meters)</option>
                    </select>
                  </label>
                </div>

                {/* Primary Prominent Button: On static web, Download DXF is the primary direct export; DWG requires desktop app */}
                {isStaticWeb ? (
                  <>
                    <button
                      className="primaryCta"
                      disabled={!result}
                      onClick={() => {
                        if (!result) return;
                        downloadText(`${safeDownloadBase(result.fileName)}-${isPldtProvider(telcoProvider) ? "pldt" : "globe"}-template.dxf`, result.dxf);
                        void logClientUsageEvent({
                          event: "EXPORT_DXF",
                          mode: "pole_survey",
                          provider: telcoProvider,
                          fileName: result.fileName,
                          itemCount: result.placemarks.length,
                          summary: `Exported Pole Survey DXF (${result.placemarks.length} objects)`,
                        });
                      }}
                    >
                      <Download size={20} />
                      <span>{`Download ${isPldtProvider(telcoProvider) ? "PLDT" : "Globe"} DXF (AutoCAD Ready)`}</span>
                    </button>

                    <div className="secondaryButtonGroup">
                      <button
                        className="secondary"
                        disabled={!result || isConvertingDwg}
                        onClick={() => void handleDownloadDwg()}
                        title="Direct .DWG export requires local AutoCAD or FTTH-KMZ-to-CAD.exe desktop app"
                      >
                        <FileText size={16} />
                        <span>{isConvertingDwg ? "Creating..." : "Download DWG (Desktop App)"}</span>
                      </button>

                      <button
                        className="secondary"
                        disabled={!result || isFetchingRoads}
                        onClick={() => void handleFetchRoads()}
                      >
                        <Route size={16} />
                        {isFetchingRoads ? "Fetching roads..." : "Add OSM Roads"}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <button
                      className="primaryCta"
                      disabled={!result || isConvertingDwg}
                      onClick={() => void handleDownloadDwg()}
                    >
                      <Download size={20} />
                      <span>{isConvertingDwg ? "Creating Native DWG..." : `Download ${isPldtProvider(telcoProvider) ? "PLDT" : "Globe"} DWG`}</span>
                    </button>

                    <div className="secondaryButtonGroup">
                      <button
                        className="secondary"
                        disabled={!result}
                        onClick={() => {
                          if (!result) return;
                          downloadText(`${safeDownloadBase(result.fileName)}-${isPldtProvider(telcoProvider) ? "pldt" : "globe"}-template.dxf`, result.dxf);
                          void logClientUsageEvent({
                            event: "EXPORT_DXF",
                            mode: "pole_survey",
                            provider: telcoProvider,
                            fileName: result.fileName,
                            itemCount: result.placemarks.length,
                            summary: `Exported Pole Survey DXF (${result.placemarks.length} objects)`,
                          });
                        }}
                      >
                        <FileText size={16} />
                        Download DXF
                      </button>

                      <button
                        className="secondary"
                        disabled={!result || isFetchingRoads}
                        onClick={() => void handleFetchRoads()}
                      >
                        <Route size={16} />
                        {isFetchingRoads ? "Fetching roads..." : "Add OSM Roads"}
                      </button>
                    </div>
                  </>
                )}

                {osmMessage && <p className="notice">{osmMessage}</p>}

                {/* Pole Survey Metric Cards Breakdown */}
                {poleCounts && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: "8px", marginTop: "14px", marginBottom: "14px" }}>
                    <div className="panel" style={{ padding: "10px 12px", textAlign: "center" }}>
                      <span style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase" }}>Total Poles</span>
                      <div style={{ fontSize: "18px", fontWeight: 800, color: "var(--text-main)" }}>{poleCounts.totalPoles}</div>
                    </div>
                    {Object.entries(poleCounts.byLayer).map(([layerName, count]) => {
                      const color = getLayerColor(layerName);
                      const hexColor = color === 1 ? "#dc2626" : color === 5 ? "#2563eb" : color === 2 ? "#16a34a" : color === 3 ? "#0284c7" : "var(--text-main)";
                      return (
                        <div className="panel" style={{ padding: "10px 12px", textAlign: "center" }} key={layerName}>
                          <span style={{ fontSize: "11px", color: hexColor, textTransform: "uppercase", fontWeight: 600 }}>{layerName}</span>
                          <div style={{ fontSize: "18px", fontWeight: 800, color: hexColor }}>{count}</div>
                        </div>
                      );
                    })}
                    {isPldtProvider(telcoProvider) &&
                      Object.entries(poleCounts.byClamp).map(([clampCode, count]) => {
                        const isGca = clampCode.endsWith("3");
                        const clampColor = isGca ? "#9333ea" : "#16a34a";
                        return (
                          <div className="panel" style={{ padding: "10px 12px", textAlign: "center", borderColor: isGca ? "rgba(147,51,234,0.35)" : "rgba(22,163,74,0.35)" }} key={clampCode}>
                            <span style={{ fontSize: "11px", color: clampColor, textTransform: "uppercase", fontWeight: 700 }}>
                              {isGca ? `GCA ${clampCode}` : `CA ${clampCode}`}
                            </span>
                            <div style={{ fontSize: "18px", fontWeight: 800, color: clampColor }}>{count}</div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            ) : (
              <div>
                <p className="empty" style={{ marginBottom: "16px" }}>
                  Upload a Google Earth KMZ file to export your DWG and DXF drawing with accurate layer colors and stencil blocks.
                </p>
                <button className="primaryCta" disabled>
                  <Download size={20} />
                  <span>{isStaticWeb ? "Download AutoCAD DXF" : "Download AutoCAD DWG"}</span>
                </button>
              </div>
            )}
          </div>

          {/* Collapsible Accordion: AutoCAD Layers (Compressed by default) */}
          <details className="panel wide accordion">
            <summary>
              <div className="summaryLeft">
                <Layers3 size={18} />
                <span>AutoCAD Layers ({formatProviderLabel(telcoProvider)} Standard)</span>
              </div>
              <span className="badge">
                {result ? `${result.placemarks.length} objects` : "Collapsed"}
              </span>
            </summary>
            <div className="accordionBody">
              <div className="layerGrid">
                {(() => {
                  const activeLayers = new Set<string>();
                  if (result) {
                    for (const p of result.placemarks) {
                      if (p.layer) activeLayers.add(p.layer);
                    }
                  }
                  const baseLayers = Object.entries(layerMeta).filter(([layer]) => {
                    if (isPldtProvider(telcoProvider)) {
                      return !["X-POLE", "EXPOLE", "P-POLE 9.14m CC", "X-MERALCO-MANILA", "X-CONVERGE", "X-DITO", "GLOBE"].includes(layer);
                    } else {
                      return ![
                        "POLE PLDT-SMART",
                        "schematic co",
                        "P-POLE",
                        "ELECTRIC POLE",
                        "Defpoints",
                        "PLDT",
                        "CA pole clamp 5-7",
                        "CA pole clamp 7-9",
                        "CA pole clamp 8-10",
                        "CA pole clamp 12-14",
                        "GCA pole clamp 5-7",
                        "GCA pole clamp 7-9",
                        "GCA pole clamp 8-10",
                        "GCA pole clamp 12-14",
                        "SAG",
                        "LOT BOUNDARY",
                        "NAP BOUNDREY",
                      ].includes(layer);
                    }
                  });
                  const baseLayerKeys = new Set(baseLayers.map(([k]) => k));
                  const extraLayers: Array<[string, { label: string; color: number }]> = [];
                  for (const l of activeLayers) {
                    if (!baseLayerKeys.has(l)) {
                      extraLayers.push([
                        l,
                        {
                          label: `${l} poles`,
                          color: getLayerColor(l),
                        },
                      ]);
                    }
                  }
                  return [...baseLayers, ...extraLayers].map(([layer, meta]) => {
                    const effectiveColor =
                      layer === "ROAD_LABELS"
                        ? isPldtProvider(telcoProvider)
                          ? 5
                          : 2
                        : meta.color;
                    return (
                      <div className="layerRow" key={layer}>
                        <i style={{ background: `var(--cad-${effectiveColor})` }} />
                        <span>{meta.label}</span>
                        <strong>{counts ? formatNumber(counts[layer] || 0) : "-"}</strong>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          </details>

          {/* Collapsible Accordion: Pole Standards & Configuration (Compressed by default) */}
          <details className="panel wide accordion">
            <summary>
              <div className="summaryLeft">
                <Settings2 size={18} />
                <span>Pole Standards & CAD Configuration</span>
              </div>
              <span className="badge">Configurable</span>
            </summary>
            <div className="accordionBody">
              {/* Element / Stencil Inclusion Toggles */}
              <div style={{ marginBottom: "16px", paddingBottom: "14px", borderBottom: "1px solid var(--border-soft)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                  <Layers3 size={16} color="#0284c7" />
                  <strong style={{ fontSize: "13px", color: "var(--text-main)" }}>CAD Elements & Stencils to Include</strong>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "10px" }}>
                  <label className="checkboxLabel" style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={poleStandard.includeFocCable !== false}
                      onChange={(e) => updatePoleStandard({ includeFocCable: e.target.checked })}
                    />
                    <span>Aerial FOC Cable (P-AERIAL_FOC)</span>
                  </label>
                  <label className="checkboxLabel" style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={Boolean(poleStandard.includeGridPagingBox)}
                      onChange={(e) => updatePoleStandard({ includeGridPagingBox: e.target.checked })}
                    />
                    <span>Grid Paging Box (GRID Sheet #)</span>
                  </label>
                  <label className="checkboxLabel" style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={poleStandard.includePoleStencils !== false}
                      onChange={(e) => updatePoleStandard({ includePoleStencils: e.target.checked })}
                    />
                    <span>Pole Stencils & Markers (P-POLE / EPOLE)</span>
                  </label>
                  <label className="checkboxLabel" style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={poleStandard.includeSpanMeasurements !== false}
                      onChange={(e) => updatePoleStandard({ includeSpanMeasurements: e.target.checked })}
                    />
                    <span>Span Measurements (SPAN Layer)</span>
                  </label>
                  <label className="checkboxLabel" style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={poleStandard.includeRoads !== false}
                      onChange={(e) => updatePoleStandard({ includeRoads: e.target.checked })}
                    />
                    <span>Road Boundaries & Centerlines</span>
                  </label>
                  <label className="checkboxLabel" style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={poleStandard.includeDemandPolygons !== false}
                      onChange={(e) => updatePoleStandard({ includeDemandPolygons: e.target.checked })}
                    />
                    <span>Building Footprints & Lot Boxes</span>
                  </label>
                </div>
              </div>

              <div className="formGrid">
                <label>
                  <span>Electric Utility / Power Company</span>
                  <select
                    value={poleStandard.electricUtility || "AUTO"}
                    onChange={(event) => updatePoleStandard({ electricUtility: event.target.value })}
                  >
                    <option value="AUTO">Auto-detect from KMZ (Default)</option>
                    <option value="DLPC">DLPC (Davao Light & Power)</option>
                    <option value="MERALCO">MERALCO (Manila Electric Co.)</option>
                    <option value="COTELCO">COTELCO (Cotabato Electric)</option>
                    <option value="MORE">MORE Power (Iloilo)</option>
                    <option value="VECO">VECO (Visayan Electric)</option>
                    <option value="DANECO">DANECO / NORDECO (Davao del Norte)</option>
                    <option value="DASURECO">DASURECO (Davao del Sur)</option>
                    <option value="BENECO">BENECO (Benguet)</option>
                    <option value="SOCOTECO">SOCOTECO (South Cotabato)</option>
                    <option value="LEYECO">LEYECO (Leyte)</option>
                    <option value="ILECO">ILECO (Iloilo)</option>
                    <option value="CEPALCO">CEPALCO (Cagayan de Oro)</option>
                    <option value="GENERIC">Generic (ELECTRIC POLE / EXPOLE)</option>
                  </select>
                </label>
                <label>
                  <span>CAD coordinates</span>
                  <select value={coordinateMode} onChange={(event) => updateCoordinateMode(event.target.value as CoordinateMode)}>
                    <option value="mercator">Company Standard: WGS 84 / World Mercator (EPSG:3395)</option>
                    <option value="epsg_3857">Web Mercator: WGS 84 / Pseudo-Mercator (EPSG:3857)</option>
                    <option value="epsg_4326_lat_lon">Raw Degrees: WGS 84 (EPSG:4326) — X Lat, Y Lon</option>
                    <option value="epsg_4326_lon_lat">Raw Degrees: WGS 84 (EPSG:4326) — X Lon, Y Lat</option>
                    <option value="utm">Actual Scale: WGS 84 / UTM Zone 51N (Ground meters)</option>
                  </select>
                </label>
                <label>
                  <span>Marker</span>
                  <select
                    value={poleStandard.markerStyle}
                    onChange={(event) => updatePoleStandard({ markerStyle: event.target.value as PoleStandard["markerStyle"] })}
                  >
                    <option value="ownerBlock">Provider block</option>
                    <option value="crosshair">Crosshair</option>
                    <option value="circle">Circle</option>
                    <option value="square">Square</option>
                    <option value="x">X mark</option>
                  </select>
                </label>
                <label>
                  <span>Marker size</span>
                  <input
                    type="number"
                    min={coordinateMode === "raw_lon_lat" || coordinateMode === "raw_lat_lon" ? "0.000001" : "0.1"}
                    step={coordinateMode === "raw_lon_lat" || coordinateMode === "raw_lat_lon" ? "0.000001" : "0.1"}
                    value={poleStandard.markerSize}
                    onChange={(event) => updatePoleStandard({ markerSize: Number(event.target.value) || defaultPoleStandard.markerSize })}
                  />
                </label>
                <label>
                  <span>Label height</span>
                  <input
                    type="number"
                    min={coordinateMode === "raw_lon_lat" || coordinateMode === "raw_lat_lon" ? "0.000001" : "0.1"}
                    step={coordinateMode === "raw_lon_lat" || coordinateMode === "raw_lat_lon" ? "0.000001" : "0.1"}
                    value={poleStandard.labelHeight}
                    onChange={(event) => updatePoleStandard({ labelHeight: Number(event.target.value) || defaultPoleStandard.labelHeight })}
                  />
                </label>
                <label>
                  <span>Offset X</span>
                  <input
                    type="number"
                    step={coordinateMode === "raw_lon_lat" || coordinateMode === "raw_lat_lon" ? "0.000001" : "0.1"}
                    value={poleStandard.labelOffsetX}
                    onChange={(event) => updatePoleStandard({ labelOffsetX: Number(event.target.value) })}
                  />
                </label>
                <label>
                  <span>Offset Y</span>
                  <input
                    type="number"
                    step={coordinateMode === "raw_lon_lat" || coordinateMode === "raw_lat_lon" ? "0.000001" : "0.1"}
                    value={poleStandard.labelOffsetY}
                    onChange={(event) => updatePoleStandard({ labelOffsetY: Number(event.target.value) })}
                  />
                </label>
              </div>
              <label className="templateControl">
                <span>Label template</span>
                <textarea
                  rows={3}
                  value={poleStandard.labelTemplate}
                  onChange={(event) => updatePoleStandard({ labelTemplate: event.target.value })}
                />
              </label>

              {/* Road Sizing & Right-Of-Way Standards (DPWH / Telco) */}
              <div style={{ marginTop: "16px", paddingTop: "14px", borderTop: "1px solid var(--border-soft)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                  <Route size={16} color="#15803d" />
                  <strong style={{ fontSize: "13px", color: "var(--text-main)" }}>Road Sizing & Width Standards (Meters)</strong>
                </div>
                <div className="formGrid">
                  <label>
                    <span>National Highway (m)</span>
                    <input
                      type="number"
                      step="1"
                      min="10"
                      max="50"
                      value={roadStandard.nationalHighwayWidth}
                      onChange={(e) => updateRoadStandard({ nationalHighwayWidth: Number(e.target.value) || defaultRoadWidthStandard.nationalHighwayWidth })}
                    />
                  </label>
                  <label>
                    <span>Secondary / Provincial (m)</span>
                    <input
                      type="number"
                      step="1"
                      min="6"
                      max="30"
                      value={roadStandard.secondaryWidth}
                      onChange={(e) => updateRoadStandard({ secondaryWidth: Number(e.target.value) || defaultRoadWidthStandard.secondaryWidth })}
                    />
                  </label>
                  <label>
                    <span>Municipal / Collector (m)</span>
                    <input
                      type="number"
                      step="0.5"
                      min="5"
                      max="20"
                      value={roadStandard.tertiaryWidth}
                      onChange={(e) => updateRoadStandard({ tertiaryWidth: Number(e.target.value) || defaultRoadWidthStandard.tertiaryWidth })}
                    />
                  </label>
                  <label>
                    <span>Residential Street (m)</span>
                    <input
                      type="number"
                      step="0.5"
                      min="3"
                      max="15"
                      value={roadStandard.residentialWidth}
                      onChange={(e) => updateRoadStandard({ residentialWidth: Number(e.target.value) || defaultRoadWidthStandard.residentialWidth })}
                    />
                  </label>
                  <label>
                    <span>Barangay Road (m)</span>
                    <input
                      type="number"
                      step="0.5"
                      min="2.5"
                      max="12"
                      value={roadStandard.barangayWidth}
                      onChange={(e) => updateRoadStandard({ barangayWidth: Number(e.target.value) || defaultRoadWidthStandard.barangayWidth })}
                    />
                  </label>
                  <label>
                    <span>Interior Alley / Path (m)</span>
                    <input
                      type="number"
                      step="0.5"
                      min="1.5"
                      max="8"
                      value={roadStandard.alleyWidth}
                      onChange={(e) => updateRoadStandard({ alleyWidth: Number(e.target.value) || defaultRoadWidthStandard.alleyWidth })}
                    />
                  </label>
                </div>
                <p className="hint" style={{ marginTop: "8px" }}>
                  Road boundaries in CAD are dynamically generated using these DPWH-standard right-of-way carriageway widths based on OSM road classification and lane count.
                </p>
              </div>

              {/* Aerial Cable Span Measurement & Road Inset Offset */}
              <div style={{ marginTop: "16px", paddingTop: "14px", borderTop: "1px solid var(--border-soft)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                  <Layers3 size={16} color="#0284c7" />
                  <strong style={{ fontSize: "13px", color: "var(--text-main)" }}>Aerial FOC Cable & Span Settings</strong>
                </div>
                <div className="formGrid">
                  <label>
                    <span>Span Allowance (Meters)</span>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="10"
                      value={cableStandard.allowanceMeters}
                      onChange={(e) => updateCableStandard({ allowanceMeters: Number(e.target.value) >= 0 ? Number(e.target.value) : defaultCableSpanStandard.allowanceMeters })}
                    />
                  </label>
                  <label>
                    <span>FOC Cable Road Inset Offset (Meters)</span>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      max="10"
                      value={cableStandard.roadInsetOffset ?? 3.5}
                      onChange={(e) => updateCableStandard({ roadInsetOffset: Number(e.target.value) >= 0 ? Number(e.target.value) : defaultCableSpanStandard.roadInsetOffset })}
                    />
                  </label>
                </div>
                <p className="hint" style={{ marginTop: "8px" }}>
                  FOC Cable is offset {cableStandard.roadInsetOffset ?? 3.5}m inside the road carriageway (dynamically scaled 3.0m–5.0m depending on road width) so aerial routes never stick to the road curb line. Span text has +{cableStandard.allowanceMeters.toFixed(1)}m allowance.
                </p>
              </div>

              <p className="hint" style={{ marginTop: "12px" }}>
                Standard Stencils: <code>PTPOLE</code> / <code>NEW_PLDT_SYSMBOL</code> (Globe, Innove, PLDT, Smart, Converge, Dito, ETPI), <code>EPOLE</code> / <code>NEW_ELECTRIC_SYSMBOL</code> (electric/utility), and <code>P-POLE</code> / <code>NEW_PROPOSE POLE_SYSMBOL</code> (proposed).
              </p>
            </div>
          </details>

          {/* Collapsible Accordion: Preview Table (Compressed by default) */}
          <details className="panel wide accordion">
            <summary>
              <div className="summaryLeft">
                <FileText size={18} />
                <span>Feature & Pole List Preview</span>
              </div>
              <span className="badge">
                {result ? `${result.placemarks.length} entries` : "Collapsed"}
              </span>
            </summary>
            <div className="accordionBody">
              {result ? (
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Layer</th>
                      <th>Stencil Attributes (Line 1 • Line 2)</th>
                      <th>Coordinates / Span (+{cableStandard.allowanceMeters.toFixed(1)}m)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.placemarks.slice(0, 50).map((placemark) => {
                      const point = placemark.geometry.type === "Point" ? placemark.geometry.coordinates : null;
                      const stencilPreview =
                        placemark.geometry.type === "Point"
                          ? previewPoleStencilAttributes(placemark, telcoProvider, poleDeflectionMap.get(placemark.id) || 0)
                          : null;
                      const lineSpans =
                        placemark.geometry.type === "LineString"
                          ? (() => {
                              const coords = placemark.geometry.coordinates;
                              const spans: string[] = [];
                              for (let i = 0; i < coords.length - 1; i++) {
                                const d = haversineDistance(coords[i], coords[i + 1]);
                                spans.push(`${(d + cableStandard.allowanceMeters).toFixed(1)}m`);
                              }
                              return spans.length ? spans.join(", ") : null;
                            })()
                          : null;
                      return (
                        <tr key={placemark.id}>
                          <td><strong>{placemark.name}</strong></td>
                          <td><span className="layerBadge">{placemark.layer}</span></td>
                          <td>
                            {stencilPreview ? (
                              <span style={{ fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                                <code>{stencilPreview.line1}</code>
                                <span>•</span>
                                <code>{stencilPreview.line2}</code>
                                {stencilPreview.clamp && (
                                  <span
                                    title={`${stencilPreview.clamp.isCorner ? "GCA Curve/Corner" : "CA Straight"} Clamp (${stencilPreview.clamp.size}) — Deflection: ${stencilPreview.clamp.deflectionDeg.toFixed(1)}°`}
                                    style={{
                                      background: stencilPreview.clamp.isCorner ? "rgba(147, 51, 234, 0.14)" : "rgba(22, 163, 74, 0.14)",
                                      color: stencilPreview.clamp.isCorner ? "#9333ea" : "#15803d",
                                      border: `1px solid ${stencilPreview.clamp.isCorner ? "rgba(147, 51, 234, 0.4)" : "rgba(22, 163, 74, 0.4)"}`,
                                      borderRadius: "4px",
                                      padding: "1px 6px",
                                      fontWeight: 700,
                                      fontSize: "11px",
                                    }}
                                  >
                                    {stencilPreview.clamp.code}
                                  </span>
                                )}
                              </span>
                            ) : (
                              placemark.geometry.type
                            )}
                          </td>
                          <td>
                            {point ? (
                              `${point.lat.toFixed(6)}, ${point.lon.toFixed(6)}`
                            ) : lineSpans ? (
                              <span style={{ color: "#d946ef", fontWeight: 600 }}>Spans: {lineSpans}</span>
                            ) : (
                              "-"
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <p className="empty">Converted poles and features will appear here after loading a file.</p>
              )}
            </div>
          </details>
        </div>
        )}

        {/* Legal & Author Footer */}
        <footer className="appFooter">
          <div className="footerContent">
            <div className="authorInfo">
              <ShieldCheck
                size={16}
                color="#15803d"
                style={{ cursor: "pointer" }}
                onDoubleClick={() => {
                  setShowTelemetryModal(true);
                  void fetchClientUsageStatus(false).then((s) => {
                    if (s) setUsageStatus(s);
                  });
                }}
              />
              <span
                onDoubleClick={() => {
                  setShowTelemetryModal(true);
                  void fetchClientUsageStatus(false).then((s) => {
                    if (s) setUsageStatus(s);
                  });
                }}
              >
                © 2026 <strong>Caesar Ian Samulde</strong>. All Rights Reserved worldwide.
              </span>
              <span className="footerDivider">•</span>
              <span>Reverse engineering, resale, and unauthorized copying are strictly prohibited.</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <button
                type="button"
                className="licenseLinkButton"
                onClick={() => setShowChangelogModal(true)}
              >
                <Sparkles size={14} />
                <span>What's New (v2.3.0)</span>
              </button>
              <button
                type="button"
                className="licenseLinkButton"
                onClick={() => setShowLicenseModal(true)}
              >
                <Scale size={14} />
                <span>License & EULA Terms</span>
              </button>
            </div>
          </div>
        </footer>
      </section>

      {/* Startup Click-Through End User License Agreement (EULA) */}
      {!hasAcceptedEula && (
        <div className="modalOverlay">
          <div className="modalCard" onClick={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <div className="modalTitle">
                <ShieldCheck size={20} color="#15803d" />
                <h2>End User License Agreement (EULA)</h2>
              </div>
            </div>

            <div className="modalBody">
              <div className="legalBanner">
                <strong>Proprietary Software & Intellectual Property Notice</strong>
                <p>
                  This software was personally authored and engineered by <strong>Caesar Ian Samulde</strong>. All rights, title, copyright, algorithms, block stencils, and source code remain exclusively the intellectual property of the author.
                </p>
              </div>

              {/* 1-Year License Validity Banner */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(21, 128, 61, 0.08)", border: "1px solid rgba(21, 128, 61, 0.25)", borderRadius: "8px", padding: "10px 14px", marginBottom: "14px", color: "#166534" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Clock size={18} color="#15803d" />
                  <div>
                    <strong style={{ display: "block", fontSize: "13px" }}>1-Year License Validity Period</strong>
                    <span style={{ fontSize: "12px", color: "#27533b" }}>Expires on <strong>September 2, 2027</strong></span>
                  </div>
                </div>
                <span style={{ padding: "4px 10px", background: "#15803d", color: "#ffffff", borderRadius: "9999px", fontSize: "12px", fontWeight: 700 }}>
                  {getRemainingLicenseDays()} Days License Left (Exp: Sep 2, 2027)
                </span>
              </div>

              <div className="legalSection">
                <h3>1. Strict Prohibitions (Reverse Engineering & Resale)</h3>
                <ul>
                  <li><strong>No Reverse Engineering:</strong> Reverse engineering, decompiling, disassembling, extracting, or attempting to derive the source code or CAD algorithms of this software is strictly prohibited.</li>
                  <li><strong>No Resale or Redistribution:</strong> Reselling, sublicensing, leasing, renting, or transferring this software to external clients or unauthorized third parties without prior written consent is strictly prohibited.</li>
                  <li><strong>No Unauthorized Copying:</strong> Copying, modifying, or creating derivative works of this application, its stencil definitions, or its compiled binaries is strictly prohibited.</li>
                </ul>
              </div>

              <div className="legalSection">
                <h3>2. 1-Year Time-Limited License Period</h3>
                <p>
                  This software license is granted for a fixed period of one (1) year starting <strong>September 2, 2026</strong> and expiring on <strong>September 2, 2027</strong> (<strong>{getRemainingLicenseDays()} Days License Left</strong>). Upon expiration, access to conversion tools and DWG/DXF drafting generation will terminate automatically unless a license renewal is authorized by Caesar Ian Samulde.
                </p>
              </div>

              <div className="legalSection">
                <h3>3. Conditional Employment-Bound License</h3>
                <p>
                  Company usage is granted strictly conditioned upon the author's continuous, active employment. If the Developer's employment or contractual affiliation concludes for any reason, this license <strong>immediately and automatically terminates without requiring notice</strong>. All access, execution, and utilization of this app must cease immediately upon departure.
                </p>
              </div>

              <div className="legalSection">
                <h3>4. Disclaimer of Warranty</h3>
                <p className="disclaimerText">
                  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED. IN NO EVENT SHALL THE DEVELOPER BE LIABLE FOR ANY DAMAGES OR LIABILITIES ARISING FROM THE USE OF THIS SOFTWARE.
                </p>
              </div>

              <label className="eulaCheckboxRow">
                <input
                  type="checkbox"
                  checked={eulaCheckbox}
                  onChange={(e) => setEulaCheckbox(e.target.checked)}
                />
                <span>
                  I have read, understood, and unconditionally agree to the End User License Agreement (EULA), Copyright Terms, and Fair Use Policy.
                </span>
              </label>
            </div>

            <div className="modalFooter">
              <span className="copyrightText">© 2026 Caesar Ian Samulde. All rights reserved worldwide.</span>
              <div className="eulaButtonRow">
                <button
                  type="button"
                  className="eulaDeclineButton"
                  onClick={() => setEulaDeclined(true)}
                >
                  Decline & Exit
                </button>
                <button
                  type="button"
                  className="modalAckButton"
                  disabled={!eulaCheckbox}
                  onClick={() => {
                    try {
                      localStorage.setItem("ftth_eula_accepted_v1", "true");
                    } catch {}
                    setHasAcceptedEula(true);
                  }}
                >
                  Accept & Continue
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Software License & Fair Use Policy Modal (Viewed from Footer) */}
      {showLicenseModal && (
        <div className="modalOverlay" onClick={() => setShowLicenseModal(false)}>
          <div className="modalCard" onClick={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <div className="modalTitle">
                <Scale size={20} color="#15803d" />
                <h2>Software License & Fair Use Policy</h2>
              </div>
              <button
                type="button"
                className="modalCloseButton"
                onClick={() => setShowLicenseModal(false)}
                aria-label="Close legal modal"
              >
                <X size={18} />
              </button>
            </div>

            <div className="modalBody">
              <div className="legalBanner">
                <strong>Proprietary & Conditional License Agreement</strong>
                <p>
                  This software was personally authored and engineered by <strong>Caesar Ian Samulde</strong>. Company usage is granted strictly conditioned upon the author's continuous, active employment.
                </p>
              </div>

              {/* 1-Year License Validity Banner */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(21, 128, 61, 0.08)", border: "1px solid rgba(21, 128, 61, 0.25)", borderRadius: "8px", padding: "10px 14px", marginBottom: "14px", color: "#166534" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Clock size={18} color="#15803d" />
                  <div>
                    <strong style={{ display: "block", fontSize: "13px" }}>1-Year License Validity Period</strong>
                    <span style={{ fontSize: "12px", color: "#27533b" }}>Expires on <strong>September 2, 2027</strong></span>
                  </div>
                </div>
                <span style={{ padding: "4px 10px", background: "#15803d", color: "#ffffff", borderRadius: "9999px", fontSize: "12px", fontWeight: 700 }}>
                  {getRemainingLicenseDays()} Days License Left (Exp: Sep 2, 2027)
                </span>
              </div>

              <div className="legalSection">
                <h3>1. Ownership & Intellectual Property</h3>
                <p>
                  All rights, title, copyright, algorithms, block stencils, and source code in this application (<strong>FTTH KMZ to AutoCAD Converter</strong>) remain exclusively the intellectual property of <strong>Caesar Ian Samulde</strong>.
                </p>
              </div>

              <div className="legalSection">
                <h3>2. 1-Year Time-Limited License Period</h3>
                <p>
                  This software license is granted for a fixed period of one (1) year starting <strong>September 2, 2026</strong> and expiring on <strong>September 2, 2027</strong> (<strong>{getRemainingLicenseDays()} Days License Left</strong>). Upon expiration, access to conversion tools and DWG/DXF drafting generation will terminate automatically unless a license renewal is authorized by Caesar Ian Samulde.
                </p>
              </div>

              <div className="legalSection">
                <h3>3. Strict Prohibitions (Reverse Engineering, Resale & Redistribution)</h3>
                <ul>
                  <li><strong>Strictly No Reverse Engineering:</strong> Decompiling, reverse engineering, decompiling bytecode, extracting algorithms, or tampering with the software is strictly prohibited.</li>
                  <li><strong>Strictly No Resale or Sub-licensing:</strong> Reselling, leasing, transferring, or distributing this software to any external client, contractor, or third party is prohibited.</li>
                  <li><strong>Integrity of Attribution:</strong> Removing developer attribution, copyright notices, or white-labeling is strictly prohibited.</li>
                </ul>
              </div>

              <div className="legalSection">
                <h3>4. Conditional Employment-Bound License</h3>
                <p>
                  The Developer grants the Employer / Company a limited, non-exclusive, revocable, non-transferable license to utilize this software for internal FTTH mapping and AutoCAD drafting operations, <strong>strictly and solely while Caesar Ian Samulde remains actively employed by the Company</strong>.
                </p>
                <div className="legalWarning">
                  <strong>⚠️ Automatic License Termination Clause:</strong>
                  <p>
                    If the Developer's employment or contractual affiliation with the Company concludes for any reason whatsoever, this license <strong>immediately and automatically terminates without requiring notice</strong>. All access, hosting, execution, and utilization of this app, its source code, and its compiled binaries must cease immediately upon departure.
                  </p>
                </div>
              </div>

              <div className="legalSection">
                <h3>5. Disclaimer of Warranty & Liability</h3>
                <p className="disclaimerText">
                  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED. IN NO EVENT SHALL THE DEVELOPER BE LIABLE FOR ANY DAMAGES, LOSS OF DATA, OR LIABILITIES ARISING FROM THE USE OF THIS SOFTWARE.
                </p>
              </div>
            </div>

            <div className="modalFooter">
              <span className="copyrightText">© 2026 Caesar Ian Samulde. All rights reserved worldwide.</span>
              <button
                type="button"
                className="modalAckButton"
                onClick={() => setShowLicenseModal(false)}
              >
                Understood & Acknowledged
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Author Usage Audit Telemetry & Remote Kill-Switch Modal */}
      {showTelemetryModal && (
        <div className="modalOverlay" onClick={() => setShowTelemetryModal(false)}>
          <div className="modalCard" style={{ maxWidth: "820px" }} onClick={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <div className="modalTitle">
                <History size={20} color="#15803d" />
                <h2>Usage Audit Telemetry & Remote License Control</h2>
              </div>
              <button
                type="button"
                className="modalCloseButton"
                onClick={() => setShowTelemetryModal(false)}
                aria-label="Close telemetry modal"
              >
                <X size={18} />
              </button>
            </div>

            <div className="modalBody" style={{ maxHeight: "74vh", overflowY: "auto" }}>
              {/* Workstation Identity Banner */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px", background: "var(--bg-elevated)", border: "1px solid var(--border-soft)", borderRadius: "10px", padding: "12px 14px", marginBottom: "16px", fontSize: "12.5px" }}>
                <div>
                  <span style={{ color: "var(--text-muted)", display: "block", fontSize: "11px" }}>Workstation Identity</span>
                  <strong>{usageStatus?.machine ? `${usageStatus.machine.hostname}\\${usageStatus.machine.username}` : "Detecting..."}</strong>
                </div>
                <div>
                  <span style={{ color: "var(--text-muted)", display: "block", fontSize: "11px" }}>Hardware Machine ID</span>
                  <strong style={{ fontFamily: "monospace", color: "#0284c7" }}>{usageStatus?.machine?.machineId || "N/A"}</strong>
                </div>
                <div>
                  <span style={{ color: "var(--text-muted)", display: "block", fontSize: "11px" }}>License Status</span>
                  <strong style={{ color: usageStatus?.revocation?.revoked ? "#dc2626" : "#16a34a" }}>
                    {usageStatus?.revocation?.revoked ? "⛔ REVOKED" : "✅ ACTIVE (Verified)"}
                  </strong>
                </div>
                <div>
                  <span style={{ color: "var(--text-muted)", display: "block", fontSize: "11px" }}>Remote Telemetry</span>
                  <strong style={{ color: usageStatus?.config?.hasWebhook ? "#16a34a" : "#d97706" }}>
                    {usageStatus?.config?.hasWebhook ? "🟢 Webhook Connected" : "⚪ Local Audit Only"}
                  </strong>
                </div>
              </div>

              {/* Author Configuration Section (Passkey Protected) */}
              <div className="panel" style={{ padding: "14px 16px", marginBottom: "16px", border: "1px solid rgba(21, 128, 61, 0.3)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                  <strong style={{ fontSize: "14px", display: "flex", alignItems: "center", gap: "6px" }}>
                    <ShieldCheck size={16} color="#15803d" />
                    Author Remote Webhook & Kill-Switch Setup (Caesar Ian Samulde)
                  </strong>
                  {!authorUnlocked && (
                    <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                      <input
                        type="password"
                        placeholder="Author Passkey..."
                        value={authorPasskey}
                        onChange={(e) => setAuthorPasskey(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && (authorPasskey === "samulde2026" || authorPasskey === "caesar2026")) {
                            setAuthorUnlocked(true);
                          }
                        }}
                        style={{ padding: "5px 10px", borderRadius: "6px", border: "1px solid var(--border-soft)", fontSize: "12px", width: "150px" }}
                      />
                      <button
                        type="button"
                        className="secondaryButton"
                        style={{ padding: "5px 10px", fontSize: "12px" }}
                        onClick={() => {
                          if (authorPasskey === "samulde2026" || authorPasskey === "caesar2026") {
                            setAuthorUnlocked(true);
                            setTelemetryStatusMsg("");
                          } else {
                            setTelemetryStatusMsg("❌ Invalid Author Passkey.");
                          }
                        }}
                      >
                        Unlock Controls
                      </button>
                    </div>
                  )}
                </div>

                {telemetryStatusMsg && (
                  <div style={{ padding: "8px 12px", borderRadius: "6px", background: telemetryStatusMsg.startsWith("❌") || telemetryStatusMsg.startsWith("Error") ? "rgba(220, 38, 38, 0.1)" : "rgba(22, 163, 74, 0.1)", color: telemetryStatusMsg.startsWith("❌") || telemetryStatusMsg.startsWith("Error") ? "#dc2626" : "#15803d", fontSize: "12.5px", fontWeight: 600, marginBottom: "10px" }}>
                    {telemetryStatusMsg}
                  </div>
                )}

                {authorUnlocked ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px", fontSize: "13px" }}>
                    <div>
                      <label style={{ display: "block", fontWeight: 600, marginBottom: "4px" }}>
                        1. Remote Usage Logger Webhook URL (Google Apps Script Web App URL or Discord Webhook URL):
                      </label>
                      <input
                        type="url"
                        placeholder="https://script.google.com/macros/s/.../exec  OR  https://discord.com/api/webhooks/..."
                        value={webhookUrlInput}
                        onChange={(e) => setWebhookUrlInput(e.target.value)}
                        style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid var(--border-soft)", fontFamily: "monospace", fontSize: "12px" }}
                      />
                      <small style={{ color: "var(--text-muted)", display: "block", marginTop: "3px" }}>
                        Every app launch, KMZ conversion, and DWG/DXF export is sent here in real time (and queued offline if the PC has no internet, then flushed automatically when online).
                      </small>
                    </div>

                    <div>
                      <label style={{ display: "block", fontWeight: 600, marginBottom: "4px" }}>
                        2. Remote License Kill-Switch URL (Google Apps Script URL or GitHub Gist Raw URL):
                      </label>
                      <input
                        type="url"
                        placeholder="https://script.google.com/macros/s/.../exec  OR  https://gist.githubusercontent.com/.../raw/license.json"
                        value={killSwitchUrlInput}
                        onChange={(e) => setKillSwitchUrlInput(e.target.value)}
                        style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid var(--border-soft)", fontFamily: "monospace", fontSize: "12px" }}
                      />
                      <small style={{ color: "var(--text-muted)", display: "block", marginTop: "3px" }}>
                        If this URL returns <code>{`{"status":"REVOKED","revoked":true}`}</code> or text starting with <code>REVOKED</code>, the tool immediately locks down on that PC and still alerts your webhook on every launch attempt!
                      </small>
                    </div>

                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "4px" }}>
                      <button
                        type="button"
                        className="primaryButton"
                        disabled={isSavingTelemetry}
                        onClick={() => void handleSaveTelemetryConfig(true)}
                        style={{ padding: "8px 14px", fontSize: "12.5px" }}
                      >
                        {isSavingTelemetry ? "Saving & Testing..." : "💾 Save & Send Test Ping"}
                      </button>
                      <button
                        type="button"
                        className="secondaryButton"
                        disabled={isSavingTelemetry}
                        onClick={() => void handleSaveTelemetryConfig(false)}
                        style={{ padding: "8px 14px", fontSize: "12.5px" }}
                      >
                        Save Only
                      </button>
                      <button
                        type="button"
                        className="secondaryButton"
                        style={{ padding: "8px 14px", fontSize: "12.5px" }}
                        onClick={() => {
                          void navigator.clipboard.writeText(GOOGLE_APPS_SCRIPT_TEMPLATE);
                          setTelemetryStatusMsg("✅ Copied Google Sheets Apps Script (Logger + Kill-Switch) code to clipboard!");
                        }}
                      >
                        📋 Copy Google Sheets Script
                      </button>
                      <button
                        type="button"
                        className="secondaryButton"
                        style={{ padding: "8px 14px", fontSize: "12.5px" }}
                        onClick={() => {
                          void navigator.clipboard.writeText(GITHUB_GIST_KILLSWITCH_TEMPLATE);
                          setTelemetryStatusMsg("✅ Copied GitHub Gist Kill-Switch JSON template to clipboard!");
                        }}
                      >
                        📋 Copy GitHub Gist JSON
                      </button>
                    </div>
                  </div>
                ) : (
                  <p style={{ margin: 0, fontSize: "12.5px", color: "var(--text-muted)" }}>
                    Remote webhook & kill-switch endpoints are managed by the software author. Enter the author passkey above to configure endpoints or send a test ping.
                  </p>
                )}
              </div>

              {/* Recent Local Usage Audit Log Table */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <strong style={{ fontSize: "13.5px" }}>Recent Workstation Usage Audit Logs ({usageStatus?.recentLogs?.length || 0} events)</strong>
                  <span style={{ fontSize: "11.5px", color: "var(--text-muted)", fontFamily: "monospace" }}>
                    {usageStatus?.config?.auditLogPath || "%LOCALAPPDATA%\\FTTH-KMZ-to-CAD\\usage-audit.jsonl"}
                  </span>
                </div>
                <div style={{ overflowX: "auto", maxHeight: "280px", overflowY: "auto", border: "1px solid var(--border-soft)", borderRadius: "8px" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                    <thead>
                      <tr style={{ background: "var(--bg-elevated)", borderBottom: "1px solid var(--border-soft)", textAlign: "left" }}>
                        <th style={{ padding: "7px 10px" }}>Timestamp</th>
                        <th style={{ padding: "7px 10px" }}>Event</th>
                        <th style={{ padding: "7px 10px" }}>Workstation</th>
                        <th style={{ padding: "7px 10px" }}>File Name</th>
                        <th style={{ padding: "7px 10px" }}>Items</th>
                        <th style={{ padding: "7px 10px" }}>Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usageStatus?.recentLogs?.length ? (
                        usageStatus.recentLogs.map((log) => (
                          <tr key={log.id} style={{ borderBottom: "1px solid var(--border-soft)" }}>
                            <td style={{ padding: "6px 10px", fontFamily: "monospace", fontSize: "11px", whiteSpace: "nowrap" }}>
                              {new Date(log.timestamp).toLocaleString()}
                            </td>
                            <td style={{ padding: "6px 10px", fontWeight: 700, color: log.event.includes("EXPORT") ? "#16a34a" : log.event === "KMZ_CONVERT" ? "#2563eb" : "var(--text-main)" }}>
                              {log.event}
                            </td>
                            <td style={{ padding: "6px 10px", fontFamily: "monospace", fontSize: "11px" }}>
                              {log.machine?.hostname}\{log.machine?.username}
                            </td>
                            <td style={{ padding: "6px 10px", fontWeight: 600 }}>{log.fileName || "-"}</td>
                            <td style={{ padding: "6px 10px" }}>{log.itemCount || 0}</td>
                            <td style={{ padding: "6px 10px", color: "var(--text-muted)" }}>{log.summary}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} style={{ padding: "18px", textAlign: "center", color: "var(--text-muted)" }}>
                            No audit events recorded yet in this session.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="modalFooter">
              <span className="copyrightText">FTTH Drafting Utility • © 2026 Caesar Ian Samulde</span>
              <button
                type="button"
                className="modalAckButton"
                onClick={() => setShowTelemetryModal(false)}
              >
                Close Audit Panel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* What's New & Release Changelog Modal */}
      {showChangelogModal && (
        <div className="modalOverlay" onClick={() => setShowChangelogModal(false)}>
          <div className="modalCard" style={{ maxWidth: "740px" }} onClick={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <div className="modalTitle">
                <Sparkles size={20} color="#15803d" />
                <h2>What's New & Release Changelog</h2>
              </div>
              <button
                type="button"
                className="modalCloseButton"
                onClick={() => setShowChangelogModal(false)}
                aria-label="Close changelog modal"
              >
                <X size={18} />
              </button>
            </div>

            <div className="modalBody" style={{ maxHeight: "70vh", overflowY: "auto" }}>
              {/* Version 2.3.0 */}
              <div className="changelogCard" style={{ borderLeft: "4px solid #16a34a" }}>
                <div className="changelogVersionHeader">
                  <div className="changelogVersionTitle">
                    <span>v2.3.0</span>
                    <span style={{ fontSize: "12px", color: "var(--text-muted, #64748b)", fontWeight: 500 }}>• October 26, 2026</span>
                  </div>
                  <span className="changelogReleaseTag" style={{ background: "#16a34a" }}>Current Version</span>
                </div>
                <ul className="changelogList">
                  <li>
                    <strong>📦 Accurate 8-Lines (10 Boxes) vs 16-Lines (16 Boxes) Lot Box Count (Commit <code>ec91112</code>)</strong>:
                    <br />• Corrected line-count parsing for HLD Proposed NAPs named <code>MINXXX_L9XX_NXX_8_LINES</code> or <code>...16_LINES</code> (supporting underscores, dashes, and spaces).
                    <br />• Fixed legacy heuristic conflict where <code>N01</code> previously forced 16 lines regardless of explicit naming; explicit <code>8_LINES</code> / <code>1:8</code> / <code>8-PORT</code> now takes strict precedence.
                    <br />• <strong>8-Lines NAPs</strong> consistently generate exactly <strong>10 residential lot boxes</strong> (5 columns × 2 rows).
                    <br />• <strong>16-Lines NAPs</strong> consistently generate exactly <strong>16 residential lot boxes</strong> (8 columns × 2 rows).
                  </li>
                  <li>
                    <strong>🗺️ HLD KMZ as Single Source of Truth for Proposed NAPs (Commits <code>9db6598</code>, <code>9d2641e</code>, <code>6c008ee</code>)</strong>:
                    <br />• Removed legacy pole survey scanning for <code>Proposed NAP: YES</code> attributes, completely eliminating false positives from outdated or conflicting pole survey files in multi-survey sites.
                    <br />• The HLD KMZ file (specifically placemarks under the <code>PROPOSED NAP</code> folder) is now the definitive source of truth for NAP locations and lot box layouts.
                    <br />• Cleaned up UI/UX by removing obsolete pole-scanning toggles and showing direct visual HLD NAP badges and counts.
                  </li>
                  <li>
                    <strong>📐 Grid Paging Box Unchecked by Default</strong>:
                    <br />• <code>Grid Paging Box (GRID Sheet #)</code> is now unchecked (disabled) by default under Pole Standards, producing cleaner CAD drawings by default without paging grid sheet outlines unless explicitly requested.
                  </li>
                  <li>
                    <strong>⚡ Optimized Web DXF Direct Export & Desktop DWG Guide (Commit <code>c85e447</code>)</strong>:
                    <br />• Optimized the web application to provide instant, 1-click native DXF downloads directly compatible with all AutoCAD versions (Civil 3D, Map 3D, AutoCAD LT).
                    <br />• Added helpful contextual documentation for direct DWG creation via the local desktop utility.
                  </li>
                  <li>
                    <strong>🚀 Automated CI/CD Continuous Deployment (Commit <code>b16d831</code>)</strong>:
                    <br />• Upgraded GitHub Actions build environment with Node.js 22 LTS and automated GitHub Pages deployment enablement.
                  </li>
                </ul>
              </div>

              {/* Version 2.2.8 */}
              <div className="changelogCard" style={{ borderLeft: "4px solid #64748b" }}>
                <div className="changelogVersionHeader">
                  <div className="changelogVersionTitle">
                    <span>v2.2.8</span>
                    <span style={{ fontSize: "12px", color: "var(--text-muted, #64748b)", fontWeight: 500 }}>• October 2026</span>
                  </div>
                  <span style={{ fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "9999px", background: "rgba(100, 116, 139, 0.12)", color: "#475569" }}>Feature Update</span>
                </div>
                <ul className="changelogList">
                  <li>
                    <strong>🏷️ Specific HLD NAP Layering (16/8 Lines, LCP N01, Non-LCP N02-N04, Dummy)</strong>: Upgraded HLD NAP &amp; Stencil Converter with dedicated, specific AutoCAD layers:
                    <br />• <strong>Proposed 16-Lines</strong>: <code>NEW NAP 16-LINES LCP</code> (for N01) and <code>NEW NAP 16-LINES NON-LCP</code> (for N02-N04+) on Color 1 (Red).
                    <br />• <strong>Proposed 8-Lines</strong>: <code>NEW NAP 8-LINES LCP</code> (for N01) and <code>NEW NAP 8-LINES NON-LCP</code> (for N02-N04+) on Color 1 (Red).
                    <br />• <strong>Existing NAPs</strong>: <code>EXISTING NAP 16-LINES</code> and <code>EXISTING NAP 8-LINES</code> on Color 5 (Blue).
                    <br />• <strong>Dummy NAPs</strong>: <code>NEW DUMMY NAP</code> (Color 1 - Red) and <code>EXISTING DUMMY NAP</code> (Color 5 - Blue).
                    <br />• Both block insertions and all text lines (<code>MHTYPE</code> / <code>MHNO</code>) share the specific layer for one-click layer isolation and <code>SELECTSIMILAR</code> counts.
                  </li>
                  <li>
                    <strong>🔄 <code>SOURCE NAP</code> Stencil Tag for Existing NAPs</strong>: Existing NAPs now automatically display <strong><code>"SOURCE NAP"</code></strong> on Line 2 (<code>MHNO</code>), replacing <code>"NAP AUGMENT"</code> to accurately denote existing source feed locations in AutoCAD drawings. Proposed NAPs retain <code>"NAP AUGMENT"</code>.
                  </li>
                  <li>
                    <strong>🏷️ Independent Text Grips on Each Pole Line (<code>Lock position = No</code>)</strong>: All pole attribute definitions (<code>ATTDEF</code>) and instances (<code>ATTRIB</code>) across Globe and PLDT poles have attribute lock position disabled (<code>280 = 0</code>), ensuring each line of pole data text (Pole tag, CC/Clamp, Coordinates) retains its own individual on-screen grip point for repositioning. Designers can rotate the whole pole symbol and text together by clicking the center insertion grip and pressing Spacebar twice (AutoCAD's native <code>** ROTATE **</code> mode) without typing <code>RO</code>.
                  </li>
                  <li>
                    <strong>📏 Straight Horizontal Default Orientation (<code>0°</code>) for PLDT Poles</strong>: All PLDT pole blocks and attributes now default to a straight horizontal orientation (<code>0°</code> rotation) with clean 3-line stacking to the right of the pole symbol and a symmetric <code>X</code> crossbar inside <code>NEW_ELECTRIC_SYSMBOL</code>.
                  </li>
                  <li>
                    <strong>🔩 PLDT <code>P-7</code> Pole Clamp Classified as <code>7-9</code> (<code>S2</code> / <code>S3</code>)</strong>: Proposed poles and <code>P-7</code> poles in PLDT mode now map to the <strong><code>7-9</code></strong> pole clamp size class (<code>S2</code> for straight runs, <code>S3</code> for curve/corner poles) instead of <code>5-7</code>.
                  </li>
                  <li>
                    <strong>📐 Provider-Specific Aerial Span Allowance (<code>+0.5m</code> PLDT / <code>+2.0m</code> Globe)</strong>: Automatically sets the aerial cable span allowance to <strong><code>+0.5m</code></strong> when switching to PLDT (Structured or Legacy) and <strong><code>+2.0m</code></strong> when switching to Globe across both the Pole Survey Converter and HLD NAP Converter.
                  </li>
                  <li>
                    <strong>🔴 Dual PLDT / Smart Converter Modes (Structured & Legacy)</strong>: Added <strong>PLDT (Structured)</strong> for structured survey KMZ files (e.g. <code>63306_poles_with_photos</code> with bullet-separated pole names and HTML <code>&lt;table&gt;</code> metadata) while preserving <strong>PLDT (Legacy)</strong> for older unstructured single-line KMZ files.
                  </li>
                  <li>
                    <strong>🏷️ Structured PLDT Stencil Attribute Mapping (Original Stencils Intact)</strong>:
                    <br />• <strong>Electric Poles (<code>NEW_ELECTRIC_SYSMBOL</code>)</strong>: Line 1 (<code>EP</code>) = Pure Pole Tag # (e.g. <code>51430</code>, <code>NPT</code>, <code>NLT (1T)</code>), Line 2 (<code>CC</code>) = <code>CC(7-9)</code> / <code>CC(8-10)</code> / <code>W(7-9)</code>, Line 3 = Coordinates.
                    <br />• <strong>PLDT / Smart Poles (<code>NEW_PLDT_SYSMBOL</code>)</strong>: Line 1 (<code>PLDT</code>) = <code>PLDT-56425</code> (when numbered) or <code>PLDT-NPT</code> (when untagged), Line 2 (<code>CC</code>) = <code>CC(7-9)</code>, Line 3 = Coordinates.
                    <br />• <strong>Proposed Poles (<code>NEW_PROPOSE POLE_SYSMBOL</code>)</strong>: Line 1 (<code>PROPOSED-POLE</code>) = <code>Proposed Pole</code>, Line 2 (<code>SIZE</code>) = <code>7.5m</code> (for <code>P-7</code>) or <code>9.14m</code> (for <code>P-9</code>), Line 3 = Coordinates.
                  </li>
                  <li>
                    <strong>🔩 PLDT Pole Clamp Label Element & Stencil Legend (<code>VS2</code>/<code>S2</code>/<code>B2</code>/<code>VB2</code> & <code>VS3</code>/<code>S3</code>/<code>B3</code>/<code>VB3</code>)</strong>: Automatically places the corresponding pole clamp label beside each pole based on its size (<code>5-7</code>, <code>7-9</code>, <code>8-10</code>, <code>12-14</code>) and route deflection angle (Green <strong>CA Clamp Straight</strong> <code>VS2</code>/<code>S2</code>/<code>B2</code>/<code>VB2</code> on layers <code>CA pole clamp *</code>, and Purple <strong>GCA Clamp Curve/Corner</strong> <code>VS3</code>/<code>S3</code>/<code>B3</code>/<code>VB3</code> on layers <code>GCA pole clamp *</code>), plus embeds the complete <strong>POLE CLAMP</strong> stencil legend box in the CAD drawing.
                  </li>
                  <li>
                    <strong>📐 Proposed Pole Uniform Line Spacing & Provider Road Label Colors</strong>: Aligned PLDT Proposed Pole (<code>NEW_PROPOSE POLE_SYSMBOL</code>) 3-line attribute spacing to a uniform 2.95-unit step, restored unnamed corridor OSM road generation so all surveyed corridors receive road lines, and set <code>ROAD_LABELS</code> to <strong>Blue (AutoCAD Color 5)</strong> for PLDT and <strong>Yellow (AutoCAD Color 2)</strong> for Globe.
                  </li>
                </ul>
              </div>

              {/* Version 2.2.7 */}
              <div className="changelogCard" style={{ borderLeft: "4px solid #16a34a" }}>
                <div className="changelogVersionHeader">
                  <div className="changelogVersionTitle">
                    <span>v2.2.7</span>
                    <span style={{ fontSize: "12px", color: "var(--text-muted, #64748b)", fontWeight: 500 }}>• September 2026</span>
                  </div>
                </div>
                <ul className="changelogList">
                  <li>
                    <strong>⚡ Dedicated AutoCAD Layers for Every Pole Type & Utility</strong>: Surveyed poles are automatically classified onto distinct AutoCAD layers representing their exact utility owner or provider (e.g. <code>DLPC</code>, <code>MERALCO</code>, <code>COTELCO</code>, <code>MORE</code>, <code>VECO</code>, <code>PLDT</code>, <code>GLOBE</code>, <code>CONVERGE</code>, <code>DITO</code>, <code>P-POLE</code>).
                  </li>
                  <li>
                    <strong>🎯 Seamless AutoCAD <code>SELECTSIMILAR</code> Pole Counting</strong>: Drafters can now select any pole in AutoCAD and run <code>SELECTSIMILAR</code> to immediately select all poles of that exact type/utility in the drawing and see the exact pole count in AutoCAD's Properties panel. Block references (<code>INSERT</code>) and attribute definitions (<code>ATTRIB</code>) share the same dedicated layer.
                  </li>
                  <li>
                    <strong>📊 Live Pole Breakdown Metric Cards</strong>: Added real-time summary metric cards in the Pole Survey Converter tab showing <strong>Total Poles</strong> and individual counts for every detected pole layer/utility in the drawing.
                  </li>
                  <li>
                    <strong>⚡ Electric Utility / Power Company Selector</strong>: Added an Electric Utility configuration dropdown in Pole Standards with 1-click presets for electric coops (<code>Auto-detect from KMZ</code>, <code>DLPC</code>, <code>MERALCO</code>, <code>COTELCO</code>, <code>MORE</code>, <code>VECO</code>, <code>DANECO/NORDECO</code>, <code>DASURECO</code>, <code>BENECO</code>, <code>SOCOTECO</code>, <code>LEYECO</code>, <code>ILECO</code>, <code>CEPALCO</code>, and <code>Generic</code>) enabling instant drawing reclassification.
                  </li>
                </ul>
              </div>

              {/* Version 2.2.5 */}
              <div className="changelogCard" style={{ borderLeft: "4px solid #2563eb" }}>
                <div className="changelogVersionHeader">
                  <div className="changelogVersionTitle">
                    <span>v2.2.5</span>
                    <span style={{ fontSize: "12px", color: "var(--text-muted, #64748b)", fontWeight: 500 }}>• September 2026</span>
                  </div>
                </div>
                <ul className="changelogList">
                  <li>
                    <strong>🔵 Existing NAP Blue Stencil (<code>GLOBE NAP EXISTING</code> & <code>GLOBE NAP 8-LINES EXISTING</code>)</strong>: Added official Globe blue stencils on layer <code>EXISTING NAP</code> (AutoCAD Color 5 - Blue). Features identical geometry to proposed stencils (outer D-box, dome ellipse, mounting bracket triangle, port lines, and <code>MHTYPE</code> / <code>MHNO</code> attributes), accurately drafted in pure blue.
                  </li>
                  <li>
                    <strong>🏷️ Batch Identifier Detection</strong>: NAPs with batch identifiers (e.g. <code>(BATCH 2 PROPOSED)</code>, <code>BATCH 1</code>, <code>BATCH 2</code>, <code>B2</code>) are automatically identified and classified as <strong>EXISTING</strong>, even if they have "proposed" in their name or reside in a proposed KMZ folder.
                  </li>
                  <li>
                    <strong>✨ Clean Attribute ID Formatting</strong>: Automatically cleans trailing batch annotations from attribute Line 1 (<code>MHTYPE</code>) so CAD drawings display clean IDs (e.g. <code>MIN167_L911_N04</code>), while preserving full batch details in tooltips and properties.
                  </li>
                  <li>
                    <strong>🗺️ Interactive Map & Metric Card Integration</strong>: Added an <strong>Existing (Batch)</strong> metric summary card in the UI and updated the interactive Leaflet map preview with distinct blue markers and an Existing NAP legend item.
                  </li>
                </ul>
              </div>

              {/* Version 2.2.4 */}
              <div className="changelogCard" style={{ borderLeft: "4px solid #15803d" }}>
                <div className="changelogVersionHeader">
                  <div className="changelogVersionTitle">
                    <span>v2.2.4</span>
                    <span style={{ fontSize: "12px", color: "var(--text-muted, #64748b)", fontWeight: 500 }}>• September 2026</span>
                  </div>
                </div>
                <ul className="changelogList">
                  <li>
                    <strong>⚡ 8-Lines Stencil Integration (<code>GLOBE NAP 8-LINES</code> / <code>SINGLE NAP 2</code>)</strong>: Added the official Globe 8-lines dual-bracket NAP stencil from <code>8 LINES Stencil.dwg</code>. Features the standard outer D-enclosure, dual internal mounting triangles (top and bottom), and 8 evenly distributed horizontal port lines (4 per bracket), fully selectable in the Stencil Block Style dropdown.
                  </li>
                  <li>
                    <strong>🤖 Automatic 8-Lines Stencil Assignment</strong>: NAPs designated as 8 lines (e.g. <code>1:8</code> splitter ratio, 8 ports, or named with <code>_8 LINES</code> like <code>MIN4026_L914_N01_8 LINES</code>) are now automatically rendered with the 8-lines stencil (<code>GLOBE NAP 8-LINES</code>) in standard Telco Block mode, while 16-lines / <code>1:16</code> NAPs receive <code>GLOBE NAP PROPOSED</code>.
                  </li>
                  <li>
                    <strong>🎯 Perfectly Centered 4-Lines Triangle (16-Lines / Standard Stencil)</strong>: Fixed the alignment in <code>GLOBE NAP PROPOSED</code> so that all 4 port lines are perfectly centered and symmetrically distributed inside the mounting triangle ($Y = \pm 0.8718, \pm 0.2906$) with uniform spacing ($0.5812$) and balanced margins.
                  </li>
                  <li>
                    <strong>🏷️ Full Telco Stencil & Attribute Parity</strong>: Both 8-lines and 16-lines stencils feature complete attribute support with <code>MHTYPE</code> (NAP ID) and <code>MHNO</code> (<code>NAP AUGMENT</code> / splitter code) on layer <code>p-mh</code> (Color 1 - Red).
                  </li>
                </ul>
              </div>

              {/* Version 2.2.3 */}
              <div className="changelogCard">
                <div className="changelogVersionHeader">
                  <div className="changelogVersionTitle">
                    <span>v2.2.3</span>
                    <span style={{ fontSize: "12px", color: "var(--text-muted, #64748b)", fontWeight: 500 }}>• September 2026</span>
                  </div>
                  <span style={{ fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "9999px", background: "rgba(100, 116, 139, 0.12)", color: "#475569" }}>Feature Update</span>
                </div>
                <ul className="changelogList">
                  <li>
                    <strong>📋 AutoCAD Block Collision Prevention (<code>GLOBE NAP DUMMY</code>)</strong>: Standardized the Dummy NAP block name to <code>GLOBE NAP DUMMY</code>. When copying and pasting into existing drawings that use Globe's template, AutoCAD previously discarded the empty stencil geometry because the template defined <code>Dummy NAP</code> with no graphics. The new unique block name ensures the port-free D-stencil outline is completely preserved when copied into any target AutoCAD drawing.
                  </li>
                  <li>
                    <strong>🔄 Dual Block Definition Export</strong>: Generates both <code>GLOBE NAP DUMMY</code> and <code>Dummy NAP</code> block definitions in the CAD tables so both modern and legacy block references resolve with the complete port-free D-frame enclosure.
                  </li>
                  <li>
                    <strong>🎨 Layer & Attribute Integrity</strong>: Maintained full isolation on layer <code>DUMMY NAP</code> (Color 1 - Red) with <code>MHTYPE</code> (NAP ID) and <code>MHNO</code> (<code>"NAP AUGMENT"</code>) intact.
                  </li>
                </ul>
              </div>

              {/* Version 2.2.2 */}
              <div className="changelogCard">
                <div className="changelogVersionHeader">
                  <div className="changelogVersionTitle">
                    <span>v2.2.2</span>
                    <span style={{ fontSize: "12px", color: "var(--text-muted, #64748b)", fontWeight: 500 }}>• September 2026</span>
                  </div>
                  <span style={{ fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "9999px", background: "rgba(100, 116, 139, 0.12)", color: "#475569" }}>Feature Update</span>
                </div>
                <ul className="changelogList">
                  <li>
                    <strong>🎨 Dedicated Layer Isolation for Dummy NAPs (<code>DUMMY NAP</code> Layer)</strong>: Proposed NAPs are maintained on layer <code>NEW NAP</code> (Color 1 - Red), while Dummy NAPs now reside on their own dedicated layer <code>DUMMY NAP</code> (Color 1 - Red) for both the block enclosure and text attributes. Drafters can toggle, freeze, or isolate Dummy NAPs independently in AutoCAD.
                  </li>
                  <li>
                    <strong>🚫 Port-Free Dummy NAP Enclosure Stencil</strong>: Updated the official Globe Dummy NAP stencil block (<code>Dummy NAP</code>) to remove all internal 4 ports and the internal mounting triangle, rendering a clean outer D-enclosure outline as required by drafting guidelines.
                  </li>
                  <li>
                    <strong>📁 Strict KMZ Folder Classification</strong>: Proposed NAPs must strictly reside inside the <code>PROPOSED NAP</code> folder in the KMZ, and Dummy NAPs must strictly reside inside the <code>DUMMY NAP</code> folder. Non-NAP entities (e.g. node site OLT/POI or closures) are kept separate and not misclassified as NAPs.
                  </li>
                  <li>
                    <strong>🏷️ Preserved <code>NAP AUGMENT</code> Line 2 Tag</strong>: Line 1 (<code>MHTYPE</code>) displays the full Dummy NAP ID (e.g. <code>MIN4026_C01_D01</code>) and Line 2 (<code>MHNO</code>) displays <strong><code>"NAP AUGMENT"</code></strong> on layer <code>DUMMY NAP</code> (Color 1 - Red).
                  </li>
                </ul>
              </div>

              {/* Version 2.2.1 */}
              <div className="changelogCard">
                <div className="changelogVersionHeader">
                  <div className="changelogVersionTitle">
                    <span>v2.2.1</span>
                    <span style={{ fontSize: "12px", color: "var(--text-muted, #64748b)", fontWeight: 500 }}>• September 2026</span>
                  </div>
                  <span style={{ fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "9999px", background: "rgba(100, 116, 139, 0.12)", color: "#475569" }}>Feature Update</span>
                </div>
                <ul className="changelogList">
                  <li>
                    <strong>🏷️ Globe Dummy NAP ID Hierarchy & Stencil Standardization</strong>: Automatically expands short Dummy NAP placemarks (<code>D1</code>, <code>D2</code>, <code>DUMMY-1</code>) into full Globe engineering identifiers (e.g. <code>MIN4026_C01_D01</code>), matching the official Globe standard from <code>NAP STENCILS.dxf</code>.
                  </li>
                  <li>
                    <strong>📦 Complete Official Globe NAP Enclosure Graphic Stencil</strong>: Renders the complete official Globe NAP stencil enclosure (outer box, dome ellipse, mounting triangle, 4 ports) on layer <code>NEW NAP</code> (Color 1 - Red) for Dummy NAPs, matching Proposed NAPs instead of showing only floating text.
                  </li>
                  <li>
                    <strong>✏️ Synchronized Attribute Hierarchy</strong>: Correctly places Line 1 (<code>MHTYPE</code>) as the full Dummy NAP ID (<code>MIN4026_C01_D01</code>) and Line 2 (<code>MHNO</code>) as <strong><code>"NAP AUGMENT"</code></strong> on layer <code>p-mh</code> (Color 1 - Red).
                  </li>
                  <li>
                    <strong>🗺️ Interactive Map Tooltip & Popup Parity</strong>: Leaflet interactive preview tooltips and popups now instantly display the full formatted Dummy NAP ID and port specifications.
                  </li>
                </ul>
              </div>

              {/* Version 2.2.0 */}
              <div className="changelogCard">
                <div className="changelogVersionHeader">
                  <div className="changelogVersionTitle">
                    <span>v2.2.0</span>
                    <span style={{ fontSize: "12px", color: "var(--text-muted, #64748b)", fontWeight: 500 }}>• September 2026</span>
                  </div>
                  <span style={{ fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "9999px", background: "rgba(100, 116, 139, 0.12)", color: "#475569" }}>Feature Update</span>
                </div>
                <ul className="changelogList">
                  <li>
                    <strong>🛣️ Smart Pole & Aerial Cable Corridor Road Extraction</strong>: OpenStreetMap road generation now focuses strictly on the roads where surveyed poles and aerial cable lines are located.
                  </li>
                  <li>
                    <strong>✂️ Automatic Background & Parallel Road Filtering</strong>: Discards extraneous neighborhood streets, parallel avenues, and distant cross-roads (outside 35m corridor buffer) that are not part of the FTTH design route.
                  </li>
                  <li>
                    <strong>📐 Route Extent Clipping & Clean Continuity</strong>: Automatically clips long highways to the surveyed project route extent with smooth connecting junctions and dual-curb boundaries.
                  </li>
                  <li>
                    <strong>🚀 High-Performance Spatial Calculation</strong>: Instant metric UTM corridor distance checks between OSM ways, surveyed pole points, and aerial cable span segments.
                  </li>
                </ul>
              </div>

              {/* Version 2.1.0 */}
              <div className="changelogCard">
                <div className="changelogVersionHeader">
                  <div className="changelogVersionTitle">
                    <span>v2.1.0</span>
                    <span style={{ fontSize: "12px", color: "var(--text-muted, #64748b)", fontWeight: 500 }}>• September 2026</span>
                  </div>
                  <span style={{ fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "9999px", background: "rgba(100, 116, 139, 0.12)", color: "#475569" }}>Feature Update</span>
                </div>
                <ul className="changelogList">
                  <li>
                    <strong>🌐 High-Level Design (HLD) NAP & Stencil Converter</strong>: Added a dedicated secondary module for processing HLD KMZ network designs with automatic classification of Proposed NAPs, Dummy NAPs, and Feeder routes.
                  </li>
                  <li>
                    <strong>🔵 Official Globe Telecom NAP Stencil Integration</strong>: Direct integration of official Globe engineering stencils (<code>NAP STENCILS.dxf</code>) with dome enclosure, 4 ports, mounting triangle on layer <code>NEW NAP</code> (Color 1 - Red), and attribute tags <code>MHTYPE</code> (NAP ID) & <code>MHNO</code> on layer <code>p-mh</code> (Color 1 - Red).
                  </li>
                  <li>
                    <strong>🏷️ Locked Line 2 Tag to <code>"NAP AUGMENT"</code></strong>: Line 2 (<code>MHNO</code>) is locked to <code>"NAP AUGMENT"</code> across all proposed NAPs matching strict Globe engineering drafting guidelines.
                  </li>
                  <li>
                    <strong>📏 Aerial Cable Span Measurements (+2m Sag Allowance)</strong>: Calculated strictly from surveyed aerial route geometries with +2m slack/sag allowance and 1-decimal place precision (e.g. <code>42.5m</code>).
                  </li>
                  <li>
                    <strong>🛠️ AutoCAD Core Console (<code>accoreconsole.exe</code>) Fixes</strong>: Synchronized 1-to-1 <code>BLOCK_RECORD</code> symbol tables and fixed DXF subclass hierarchies for seamless DWG generation in AutoCAD 2018–2027.
                  </li>
                </ul>
              </div>

              {/* Version 2.0.0 */}
              <div className="changelogCard">
                <div className="changelogVersionHeader">
                  <div className="changelogVersionTitle">
                    <span>v2.0.0</span>
                    <span style={{ fontSize: "12px", color: "var(--text-muted, #64748b)", fontWeight: 500 }}>• August 2026</span>
                  </div>
                  <span style={{ fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "9999px", background: "rgba(100, 116, 139, 0.12)", color: "#475569" }}>Major Release</span>
                </div>
                <ul className="changelogList">
                  <li>
                    <strong>⚡ Multi-CRS Geographic Reprojection</strong>: Full support for UTM (Meters), WGS84 World Mercator (EPSG:3395), Pseudo-Mercator (EPSG:3857), and Lat/Lon coordinate systems with georeferenced metadata.
                  </li>
                  <li>
                    <strong>🏷️ Automated Pole Ownership Classification</strong>: Automatic detection of Meralco, Converge, Globe, PLDT/Smart, and Electric poles.
                  </li>
                  <li>
                    <strong>🛣️ OpenStreetMap Road Survey Integration</strong>: Automatic boundary, centerline, and building footprint extraction from Overpass API.
                  </li>
                </ul>
              </div>

              {/* Version 1.0.0 */}
              <div className="changelogCard">
                <div className="changelogVersionHeader">
                  <div className="changelogVersionTitle">
                    <span>v1.0.0</span>
                    <span style={{ fontSize: "12px", color: "var(--text-muted, #64748b)", fontWeight: 500 }}>• July 2026</span>
                  </div>
                  <span style={{ fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "9999px", background: "rgba(100, 116, 139, 0.12)", color: "#475569" }}>Initial Release</span>
                </div>
                <ul className="changelogList">
                  <li>
                    <strong>📄 Core KMZ/KML to AutoCAD DXF Engine</strong>: Automated batch extraction of placemarks, paths, and polygons into structured CAD layers.
                  </li>
                </ul>
              </div>
            </div>

            <div className="modalFooter">
              <span className="copyrightText">FTTH Drafting Utility • © 2026 Caesar Ian Samulde</span>
              <button
                type="button"
                className="modalAckButton"
                onClick={() => setShowChangelogModal(false)}
              >
                Close Changelog
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Proposed NAP Location Map & Line Capacity Selector Modal */}
      {result && showProposedNapMapModal && (() => {
        const projectMetricForModal = (point: LonLat) => lonLatToUtm(point, result.zone);
        let napIdx = 0;
        const modalPoles: MapPoleItem[] = [];
        const modalLines: MapOverlayLine[] = [...hldReferenceLines];

        result.placemarks.forEach((p, idx) => {
          if (p.geometry.type === "Point") {
            const isPropNap = hasProposedNapAttribute(p);
            const isRawPropNap = hasRawProposedNapAttribute(p) || isExplicitDummyNapPole(p);
            const isExcludedPropNap = !isPropNap && isRawPropNap;
            const currentNapIdx = isPropNap ? napIdx++ : undefined;
            const currentLines = isPropNap
              ? resolvePoleProposedNapLines(p, result.placemarks, projectMetricForModal)
              : undefined;
            modalPoles.push({
              id: p.id,
              name: p.name,
              tag: rawPoleTag(p),
              lat: p.geometry.coordinates.lat,
              lon: p.geometry.coordinates.lon,
              isProposedNap: isPropNap,
              isExcludedPropNap,
              napIndex: currentNapIdx,
              currentLines,
              matchedHldName: p.properties._matchedHldName,
              remarks: findProperty(p.properties, ["remarks", "remark"]),
            });
          } else if (p.geometry.type === "LineString") {
            const isRoad = p.layer === "ROAD_CENTERLINES" || p.layer === "ROAD_BOUNDARIES";
            modalLines.push({
              id: `line-${idx}-${p.id}`,
              kind: isRoad ? "road" : "cable",
              coords: p.geometry.coordinates.map((c) => ({ lat: c.lat, lon: c.lon })),
              label: p.name,
            });
          } else if (p.geometry.type === "Polygon" && p.geometry.coordinates[0]) {
            modalLines.push({
              id: `poly-${idx}-${p.id}`,
              kind: "polygon",
              coords: p.geometry.coordinates[0].map((c) => ({ lat: c.lat, lon: c.lon })),
              label: p.name,
            });
          }
        });

        // Also include HLD pins from napResult if the user loaded HLD in the HLD tab and hasn't loaded a separate reference KMZ yet
        const activeHldPins: HldOverlayPin[] =
          hldReferencePins.length > 0
            ? hldReferencePins
            : napResult
              ? napResult.placemarks
                  .filter((np) => np.geometry.type === "Point")
                  .map((np, idx) => ({
                    id: `napres-${idx}-${np.id}`,
                    name: np.name || np.napId,
                    lat: (np.geometry as Extract<Geometry, { type: "Point" }>).coordinates.lat,
                    lon: (np.geometry as Extract<Geometry, { type: "Point" }>).coordinates.lon,
                    lines: np.ports === 8 || np.splitter === "1:8" || np.splitter === "2:8" ? 8 : 16,
                    status:
                      np.layer === "OLT_POI"
                        ? "OLT"
                        : np.isDummy || np.status === "DUMMY"
                          ? "DUMMY"
                          : np.status === "EXISTING"
                            ? "EXISTING"
                            : "PROPOSED",
                  }))
              : [];

        return (
          <ProposedNapMapModal
            isOpen={showProposedNapMapModal}
            onClose={() => setShowProposedNapMapModal(false)}
            fileName={result.fileName}
            poles={modalPoles}
            lines={modalLines}
            hldPins={activeHldPins}
            onUpdatePoleLines={updateProposedNapPoleLines}
            onToggleExcludePole={toggleExcludeProposedNapPole}
            onBatchUpdateLines={batchUpdateProposedNapPoleLines}
            onLoadHldKmzFile={(file) => void handleLoadHldReferenceKmz(file)}
            onAutoMatchFromHld={() => applyHldMatchingToResult(activeHldPins)}
          />
        );
      })()}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
