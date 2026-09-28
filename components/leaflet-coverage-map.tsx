"use client";

import { useEffect, useMemo } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  Tooltip,
  Popup,
  useMap,
  LayersControl,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Priority } from "@/lib/types";
import type { CoverageCase } from "./coverage-map";

interface LeafletCoverageMapProps {
  cases: CoverageCase[];
  selectedId: string | null;
  routePlanned: boolean;
  onSelectCase: (id: string) => void;
  priorityLabel: Record<Priority, string>;
  priorityRank: Record<Priority, number>;
}

const HUB_COORDINATES: [number, number] = [11.2721, 75.8368]; // Kozhikode Medical College Hub

// Care Hub Hospital Pin
const hubIcon = L.divIcon({
  className: "custom-hub-pin",
  html: `
    <div style="display:flex;align-items:center;justify-content:center;width:34px;height:34px;background:#0d5c4d;border:2.5px solid #ffffff;border-radius:50%;color:white;font-weight:900;font-size:15px;box-shadow:0 4px 12px rgba(0,0,0,0.35);">
      🏥
    </div>
  `,
  iconSize: [34, 34],
  iconAnchor: [17, 17],
});

function createCaseIcon(priority: Priority, alias: string, isSelected: boolean) {
  const colors: Record<Priority, { bg: string; border: string }> = {
    immediate_clinician_review: { bg: "#dc2626", border: "#991b1b" },
    urgent_review: { bg: "#d97706", border: "#b45309" },
    same_day_queue: { bg: "#0284c7", border: "#0369a1" },
    routine_queue: { bg: "#16a34a", border: "#15803d" },
    insufficient_information: { bg: "#64748b", border: "#475569" },
  };
  const color = colors[priority] ?? colors.insufficient_information;

  return L.divIcon({
    className: "custom-case-pin",
    html: `
      <div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;user-select:none;">
        <div style="display:flex;align-items:center;gap:4px;padding:4px 8px;background:${color.bg};border:2px solid ${isSelected ? "#ffffff" : color.border};border-radius:12px;color:white;font-weight:800;font-size:11px;white-space:nowrap;box-shadow:0 3px 10px rgba(0,0,0,0.32);transform:${isSelected ? "scale(1.12)" : "scale(1)"};transition:transform 0.15s ease;">
          <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#ffffff;"></span>
          ${alias}
        </div>
        <div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:6px solid ${color.bg};"></div>
      </div>
    `,
    iconSize: [90, 36],
    iconAnchor: [45, 36],
  });
}

function MapAutoCenter({ cases, selectedId }: { cases: CoverageCase[]; selectedId: string | null }) {
  const map = useMap();

  useEffect(() => {
    map.invalidateSize();
  }, [map]);

  useEffect(() => {
    if (!selectedId) return;
    const target = cases.find((c) => c.id === selectedId);
    if (target?.lat && target?.lng) {
      map.flyTo([target.lat, target.lng], 13, { duration: 0.6 });
    }
  }, [selectedId, cases, map]);

  return null;
}

function MapBoundsFit({ cases, routePlanned }: { cases: CoverageCase[]; routePlanned: boolean }) {
  const map = useMap();

  useEffect(() => {
    map.invalidateSize();
    const validPoints = cases
      .filter((c) => typeof c.lat === "number" && typeof c.lng === "number")
      .map((c) => [c.lat!, c.lng!] as [number, number]);

    const allPoints = [HUB_COORDINATES, ...validPoints];
    if (allPoints.length > 1) {
      const bounds = L.latLngBounds(allPoints);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    }
  }, [cases, routePlanned, map]);

  return null;
}

export default function LeafletCoverageMap({
  cases,
  selectedId,
  routePlanned,
  onSelectCase,
  priorityLabel,
  priorityRank,
}: LeafletCoverageMapProps) {
  const validCases = useMemo(
    () => cases.filter((c) => typeof c.lat === "number" && typeof c.lng === "number"),
    [cases]
  );

  const routePolyline = useMemo(() => {
    if (!routePlanned) return [];
    const sorted = [...validCases].sort(
      (a, b) => priorityRank[a.priority] - priorityRank[b.priority] || a.etaMinutes - b.etaMinutes
    );
    return [HUB_COORDINATES, ...sorted.map((c) => [c.lat!, c.lng!] as [number, number])];
  }, [routePlanned, validCases, priorityRank]);

  return (
    <div className="leaflet-map-wrapper" style={{ height: "100%", width: "100%", position: "relative" }}>
      <MapContainer
        center={HUB_COORDINATES}
        zoom={12}
        zoomControl={true}
        attributionControl={true}
        style={{ height: "100%", width: "100%", borderRadius: "8px", zIndex: 1 }}
      >
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="OpenStreetMap">
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              maxZoom={19}
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Carto Voyager">
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
              maxZoom={19}
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Satellite">
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              attribution="&copy; Esri, Maxar, Earthstar Geographics"
              maxZoom={19}
            />
          </LayersControl.BaseLayer>
        </LayersControl>

        <MapAutoCenter cases={validCases} selectedId={selectedId} />
        <MapBoundsFit cases={validCases} routePlanned={routePlanned} />

        {/* Priority visit route line */}
        {routePlanned && routePolyline.length > 1 && (
          <>
            <Polyline
              positions={routePolyline}
              pathOptions={{ color: "#0d5c4d", weight: 6, opacity: 0.35, lineCap: "round", lineJoin: "round" }}
            />
            <Polyline
              positions={routePolyline}
              pathOptions={{
                color: "#0d5c4d",
                weight: 3.5,
                opacity: 0.95,
                dashArray: "6, 6",
                lineCap: "round",
                lineJoin: "round",
              }}
            />
          </>
        )}

        {/* Care Hub Marker */}
        <Marker position={HUB_COORDINATES} icon={hubIcon}>
          <Tooltip permanent direction="top" offset={[0, -18]} className="leaflet-hub-tooltip">
            <strong>Care Hub (Kozhikode Medical College)</strong>
          </Tooltip>
          <Popup>
            <div style={{ padding: "4px" }}>
              <strong style={{ display: "block", color: "#0d5c4d", fontSize: "13px" }}>
                🏥 Central Care Hub
              </strong>
              <span style={{ fontSize: "11px", color: "#666" }}>
                Kozhikode Medical College · Palliative Dispatch Center
              </span>
            </div>
          </Popup>
        </Marker>

        {/* Case Severity Markers */}
        {validCases.map((item) => {
          const isSelected = selectedId === item.id;
          const icon = createCaseIcon(item.priority, item.caseAlias, isSelected);

          return (
            <Marker
              key={item.id}
              position={[item.lat!, item.lng!]}
              icon={icon}
              eventHandlers={{
                click: () => onSelectCase(item.id),
              }}
            >
              <Popup>
                <div style={{ padding: "4px", minWidth: "160px" }}>
                  <strong style={{ display: "block", fontSize: "13px", color: "#111", marginBottom: "2px" }}>
                    {item.caseAlias}
                  </strong>
                  <div style={{ fontSize: "11px", color: "#666", marginBottom: "4px" }}>
                    {item.locality} · ~{item.etaMinutes}m from hub
                  </div>
                  <div style={{ fontSize: "11px", fontWeight: "bold", color: "#0d5c4d", marginBottom: "4px" }}>
                    Priority: {priorityLabel[item.priority]}
                  </div>
                  <div style={{ fontSize: "11px", color: "#444" }}>
                    Assigned: {item.assignee ?? "Unassigned"}
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
