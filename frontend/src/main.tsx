import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { OcrConfigPanel } from './config/OcrConfigPanel.tsx'
import './lib/bridge'
import { NexusGuard } from './nexus/NexusGuard'
import { applyExelixiBranding } from './lib/exelixi-branding'
import { applyMetadataFromNexusToken, getNexusTokenFromUrl } from './lib/nexus-token-client'
import { mergeMarketplaceActorMetadata, rememberMarketplaceActorFromToken } from './lib/sso-metadata'
import { useWizardStore } from './store/wizardStore'
import { recordarRenovar } from './lib/renovacion-entrada'
import { RenovacionEntrada } from './components/RenovacionEntrada'

// Renovar: guardar el cnpoliza antes de cualquier salto SSO (o limpiar uno viejo en flujo normal).
const renovar = recordarRenovar()

// Identidad Exélixi (colores + favicon) solo si el flujo activo es el catálogo.
applyExelixiBranding('OCR de Documentos');

rememberMarketplaceActorFromToken(getNexusTokenFromUrl());

applyMetadataFromNexusToken('nexus_access_token_ocr', (metadata) => {
  const store = useWizardStore.getState();
  store.setMetadataCanal(
    mergeMarketplaceActorMetadata({ ...(store.metadataCanal || {}), ...metadata }),
  );
});

// /config (dev) o /ocr/config (prod con prefijo Apache)
const isConfigRoute = /\/config\/?$/.test(window.location.pathname);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isConfigRoute
      ? <OcrConfigPanel />
      : renovar
        ? <RenovacionEntrada />
      : (
        <NexusGuard recheckInterval={30}>
          <App />
        </NexusGuard>
      )
    }
  </StrictMode>,
)
