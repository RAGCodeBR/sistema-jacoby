import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui/card";

type ChartItem = { name: string; kg: number };

export function WasteReportCharts({
  residueData,
  monthlyData,
  formatWeight,
}: {
  residueData: ChartItem[];
  monthlyData: ChartItem[];
  formatWeight: (value: number) => string;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-4">
        <h2 className="font-semibold">Resíduos mais movimentados</h2>
        <p className="mb-3 text-sm text-muted-foreground">Peso total por tipo de resíduo.</p>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={residueData}>
              <XAxis dataKey="name" interval={0} angle={-18} textAnchor="end" height={60} />
              <YAxis />
              <Tooltip formatter={(value: number) => `${formatWeight(Number(value))} kg`} />
              <Bar dataKey="kg" fill="hsl(var(--primary))" radius={[5, 5, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <Card className="p-4">
        <h2 className="font-semibold">Evolução mensal</h2>
        <p className="mb-3 text-sm text-muted-foreground">Kg movimentados mês a mês.</p>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlyData}>
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip formatter={(value: number) => `${formatWeight(Number(value))} kg`} />
              <Bar dataKey="kg" fill="#7fb069" radius={[5, 5, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}
