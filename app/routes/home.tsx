import { useEffect, useState } from "react"
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "~/components/ui/card"
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
    type ChartConfig,
} from "~/components/ui/chart"
import { Progress } from "~/components/ui/progress"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "~/components/ui/table"

const revenueChartConfig = {
    revenue: {
        label: "Revenue",
        color: "var(--chart-1)",
    },
    orders: {
        label: "Orders",
        color: "var(--chart-4)",
    },
} satisfies ChartConfig

const serviceChartConfig = {
    api: {
        label: "API",
        color: "var(--chart-2)",
    },
    web: {
        label: "Web",
        color: "var(--chart-5)",
    },
    worker: {
        label: "Worker",
        color: "var(--chart-3)",
    },
} satisfies ChartConfig

const revenueData = [
    { month: "Jan", revenue: 4200, orders: 240 },
    { month: "Feb", revenue: 5100, orders: 280 },
    { month: "Mar", revenue: 4800, orders: 260 },
    { month: "Apr", revenue: 6200, orders: 340 },
    { month: "May", revenue: 7300, orders: 410 },
    { month: "Jun", revenue: 8800, orders: 480 },
]

const serviceData = [
    { service: "API", api: 82, web: 0, worker: 0 },
    { service: "Web", api: 0, web: 68, worker: 0 },
    { service: "Worker", api: 0, web: 0, worker: 54 },
]

const recentWorkspaces = [
    { workspace: "revserp-admin", owner: "ops", requests: "128.4k", errorRate: "0.08%", status: "Healthy" },
    { workspace: "revserp-api", owner: "backend", requests: "96.2k", errorRate: "0.21%", status: "Watch" },
    { workspace: "revserp-web", owner: "frontend", requests: "74.8k", errorRate: "0.04%", status: "Healthy" },
    { workspace: "revserp-jobs", owner: "infra", requests: "41.1k", errorRate: "0.37%", status: "Watch" },
]

const themeStorageKey = "revserp-theme"

function getInitialTheme() {
    if (typeof window === "undefined") {
        return "dark"
    }

    const storedTheme = window.localStorage.getItem(themeStorageKey)
    return storedTheme === "light" ? "light" : "dark"
}

export default function Home() {
    const [theme, setTheme] = useState<"dark" | "light">(getInitialTheme)

    useEffect(() => {
        document.documentElement.classList.toggle("dark", theme === "dark")
        window.localStorage.setItem(themeStorageKey, theme)
    }, [theme])

    const toggleTheme = () => {
        setTheme((currentTheme) => (currentTheme === "dark" ? "light" : "dark"))
    }

    return (
        <main className="min-h-svh bg-background p-6">
            <div className="mx-auto grid max-w-7xl gap-6">
                <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                    <div>
                        <h1 className="text-3xl font-medium tracking-tight">Revserp vibe check</h1>
                        <p className="text-sm text-muted-foreground">Quick dashboard mockup before the real port work starts.</p>
                    </div>
                    <Button variant="outline" onClick={toggleTheme}>
                        {theme === "dark" ? "Light mode" : "Dark mode"}
                    </Button>
                </div>

                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <MetricCard label="Total revenue" value="$128.4k" delta="+18.2%" />
                    <MetricCard label="Active users" value="18.2k" delta="+12.7%" />
                    <MetricCard label="Avg response" value="142ms" delta="-18ms" mutedDelta />
                    <MetricCard label="Uptime" value="99.98%" delta="+0.03%" />
                </div>

                <div className="grid gap-6 lg:grid-cols-3">
                    <Card className="lg:col-span-2">
                        <CardHeader>
                            <CardTitle>Revenue trend</CardTitle>
                            <CardDescription>Monthly revenue and order volume.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <ChartContainer config={revenueChartConfig} className="h-[320px]">
                                <AreaChart data={revenueData} margin={{ left: 0, right: 0, top: 12, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="month" tickLine={false} axisLine={false} />
                                    <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => `$${value}`} />
                                    <ChartTooltip content={<ChartTooltipContent />} />
                                    <Area type="monotone" dataKey="revenue" stroke="var(--chart-1)" fill="var(--chart-1)" fillOpacity={0.18} />
                                    <Area type="monotone" dataKey="orders" stroke="var(--chart-4)" fill="var(--chart-4)" fillOpacity={0.12} />
                                </AreaChart>
                            </ChartContainer>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>System health</CardTitle>
                            <CardDescription>Live-ish percentages for the port.</CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-5">
                            <HealthRow label="React migration" value={72} />
                            <HealthRow label="Component parity" value={58} />
                            <HealthRow label="Test coverage" value={34} />
                            <HealthRow label="Design polish" value={46} />
                        </CardContent>
                    </Card>
                </div>

                <div className="grid gap-6 lg:grid-cols-[1fr_0.8fr]">
                    <Card>
                        <CardHeader>
                            <CardTitle>Recent workspaces</CardTitle>
                            <CardDescription>Request volume and error rate by workspace.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Workspace</TableHead>
                                        <TableHead>Owner</TableHead>
                                        <TableHead className="text-right">Requests</TableHead>
                                        <TableHead className="text-right">Error rate</TableHead>
                                        <TableHead>Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {recentWorkspaces.map((workspace) => (
                                        <TableRow key={workspace.workspace}>
                                            <TableCell className="font-medium">{workspace.workspace}</TableCell>
                                            <TableCell>{workspace.owner}</TableCell>
                                            <TableCell className="text-right">{workspace.requests}</TableCell>
                                            <TableCell className="text-right">{workspace.errorRate}</TableCell>
                                            <TableCell>
                                                <Badge variant={workspace.status === "Healthy" ? "secondary" : "outline"}>{workspace.status}</Badge>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Requests by service</CardTitle>
                            <CardDescription>Quick split between API, web, and workers.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <ChartContainer config={serviceChartConfig} className="h-[300px]">
                                <BarChart data={serviceData} margin={{ left: 0, right: 0, top: 12, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="service" tickLine={false} axisLine={false} />
                                    <YAxis tickLine={false} axisLine={false} />
                                    <ChartTooltip content={<ChartTooltipContent />} />
                                    <Bar dataKey="api" fill="var(--chart-2)" radius={[6, 6, 0, 0]} />
                                    <Bar dataKey="web" fill="var(--chart-5)" radius={[6, 6, 0, 0]} />
                                    <Bar dataKey="worker" fill="var(--chart-3)" radius={[6, 6, 0, 0]} />
                                </BarChart>
                            </ChartContainer>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </main>
    )
}

function MetricCard({
    label,
    value,
    delta,
    mutedDelta = false,
}: {
    label: string
    value: string
    delta: string
    mutedDelta?: boolean
}) {
    return (
        <Card>
            <CardHeader className="pb-2">
                <CardDescription>{label}</CardDescription>
                <CardTitle className="text-2xl">{value}</CardTitle>
            </CardHeader>
            <CardContent>
                <Badge variant={mutedDelta ? "outline" : "secondary"}>{delta}</Badge>
            </CardContent>
        </Card>
    )
}

function HealthRow({ label, value }: { label: string; value: number }) {
    return (
        <div className="grid gap-2">
            <div className="flex items-center justify-between text-sm">
                <span>{label}</span>
                <span className="font-medium text-muted-foreground">{value}%</span>
            </div>
            <Progress value={value} />
        </div>
    )
}

