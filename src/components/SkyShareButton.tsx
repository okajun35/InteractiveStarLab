import { useState } from "react";
import { useStarViewer } from "../state/context";
import { useSimulation } from "../state/simulation";
import { encodeSkyShare } from "../sky/shareUrl";
import { useLocale } from "../i18n";

/**
 * Copies a shareable URL that carries the full viewer state in its `#sky=`
 * fragment — no server round trip, nothing persisted. Recipients opening the
 * link see the same site, time, camera, layers, and display options.
 */
export function SkyShareButton() {
  const { settings, options, skyMode } = useStarViewer();
  const { settings: sim, layers } = useSimulation();
  const { t } = useLocale();
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const fragment = encodeSkyShare({
      v: 1,
      skyMode,
      observation: {
        latitude: settings.latitude,
        longitude: settings.longitude,
        datetime: settings.datetime.toISOString(),
        azimuth: settings.azimuth,
        altitude: settings.altitude,
        fieldOfView: settings.fieldOfView,
      },
      simulation: sim,
      layers,
      display: options,
    });
    const url = `${window.location.origin}${window.location.pathname}${fragment}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt(t("share.prompt"), url);
    }
  };

  return (
    <button type="button" className="sky-share-btn" onClick={share}>
      {copied ? t("share.copied") : t("share.button")}
    </button>
  );
}
