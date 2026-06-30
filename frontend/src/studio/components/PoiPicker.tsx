import { useEffect, useState } from "react";
import { getPois } from "../../api/pois";
import { ApiError } from "../../api/client";
import type { GeoPoint, POI } from "../../api/types";

interface Props {
  start: GeoPoint;
  excludeIds: string[];
  onPick: (poi: POI) => void;
  onClose: () => void;
}

export function PoiPicker({ start, excludeIds, onPick, onClose }: Props) {
  const [candidates, setCandidates] = useState<POI[]>([]);
  const [empty, setEmpty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLoading(true);
    getPois({ lat: start.lat, lon: start.lon, distance_km: 5 })
      .then((pois) => {
        const filtered = pois.filter((p) => !excludeIds.includes(p.id));
        setCandidates(filtered);
        if (filtered.length === 0) setEmpty(true);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [start.lat, start.lon]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(33, 31, 27, 0.45)",
          zIndex: 200,
        }}
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-label="Stop toevoegen"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 201,
          width: 480,
          maxWidth: "calc(100vw - 32px)",
          maxHeight: "70vh",
          background: "var(--tq-paper)",
          border: "1px solid var(--tq-border)",
          borderRadius: 14,
          boxShadow: "var(--tq-shadow-card)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "18px 20px 14px",
            borderBottom: "1px solid var(--tq-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span style={{ font: "600 15px/1 var(--tq-sans)", color: "var(--tq-navy)" }}>
            Stop toevoegen
          </span>
          <button
            onClick={onClose}
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              font: "600 13px/1 var(--tq-sans)",
              color: "var(--tq-muted)",
              padding: "4px 8px",
            }}
          >
            Sluiten
          </button>
        </div>

        {/* POI list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px" }}>
          {loading ? (
            <p
              style={{
                textAlign: "center",
                font: "400 13px/1.5 var(--tq-sans)",
                color: "var(--tq-muted)",
                padding: "24px 0",
              }}
            >
              POI&apos;s laden…
            </p>
          ) : error ? (
            <p
              style={{
                textAlign: "center",
                font: "400 13px/1.5 var(--tq-sans)",
                color: "var(--tq-muted)",
                padding: "24px 0",
              }}
            >
              Kon POI&apos;s niet laden
            </p>
          ) : empty ? (
            <p
              style={{
                textAlign: "center",
                font: "400 13px/1.5 var(--tq-sans)",
                color: "var(--tq-muted)",
                padding: "24px 0",
              }}
            >
              Geen POI&apos;s gevonden
            </p>
          ) : (
            <ul role="list" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
              {candidates.map((poi) => (
                <li
                  key={poi.id}
                  onClick={() => onPick(poi)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 12px",
                    borderRadius: 9,
                    cursor: "pointer",
                    background: "var(--tq-sand)",
                    border: "1px solid var(--tq-border)",
                    transition: "background 0.1s",
                  }}
                >
                  <span
                    style={{
                      flex: 1,
                      font: "600 13px/1.2 var(--tq-sans)",
                      color: "var(--tq-ink)",
                    }}
                  >
                    {poi.name}
                  </span>
                  <span
                    style={{
                      font: "500 11px/1 var(--tq-sans)",
                      color: poi.facts.length === 0 ? "var(--tq-muted)" : "var(--tq-green-ink)",
                      background: poi.facts.length === 0 ? "var(--tq-cream)" : "var(--tq-green-bg)",
                      border: `1px solid ${poi.facts.length === 0 ? "var(--tq-border)" : "var(--tq-green-border)"}`,
                      borderRadius: 5,
                      padding: "3px 7px",
                      flexShrink: 0,
                    }}
                  >
                    {poi.facts.length === 0 ? "geen feiten" : `${poi.facts.length} feiten`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
