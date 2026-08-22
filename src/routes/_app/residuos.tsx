import { createFileRoute } from "@tanstack/react-router";
import { WasteManagementModule } from "@/components/WasteManagementModule";

/** Administrative workspace for the complete residue report lifecycle. */
export const Route = createFileRoute("/_app/residuos")({ component: ResidueManagementPage });
function ResidueManagementPage() { return <WasteManagementModule />; }
