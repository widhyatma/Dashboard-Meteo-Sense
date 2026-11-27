// app/dashboard/klimatologi/page.tsx
"use client";

import React, { Suspense } from "react";
import dynamic from "next/dynamic";
import {
  Sparkles,
  Activity,
  Globe,
  ShieldAlert,
  Sprout,
  Loader2,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useClimatologyWorkspace,
  ClimatologyWorkspaceTab,
} from "@/hooks/climatology/useClimatologyWorkspace";
import { ClimatologyStickyBar } from "@/components/climatology/ClimatologyStickyBar";

// Dynamic loading of workspace sections with SSR disabled for optimal bundle splitting
const OverviewWorkspace = dynamic(
  () => import("@/components/climatology/workspaces/OverviewWorkspace"),
  {
    ssr: false,
    loading: () => <WorkspaceSkeleton />,
  }
);

const ObservationWorkspace = dynamic(
  () => import("@/components/climatology/workspaces/ObservationWorkspace"),
  {
    ssr: false,
    loading: () => <WorkspaceSkeleton />,
  }
);

const ReanalysisWorkspace = dynamic(
  () => import("@/components/climatology/workspaces/ReanalysisWorkspace"),
  {
    ssr: false,
    loading: () => <WorkspaceSkeleton />,
  }
);

const ExtremesHydroWorkspace = dynamic(
  () => import("@/components/climatology/workspaces/ExtremesHydroWorkspace"),
  {
    ssr: false,
    loading: () => <WorkspaceSkeleton />,
  }
);

const AgrometWorkspace = dynamic(
  () => import("@/components/climatology/workspaces/AgrometWorkspace"),
  {
    ssr: false,
    loading: () => <WorkspaceSkeleton />,
  }
);

function WorkspaceSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-80 w-full rounded-xl" />
    </div>
  );
}

function ClimatologyWorkspaceContent() {
  const ws = useClimatologyWorkspace();

  return (
    <div className="-mx-3 sm:-mx-6 lg:-mx-8 -mt-4 sm:-mt-6 min-h-screen bg-slate-50/60 dark:bg-slate-950/60 pb-16">
      {/* 1. Compact Sticky Control Bar flush under topbar */}
      <ClimatologyStickyBar ws={ws} />

      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pt-5 space-y-6">
        {/* 2. Compact Modern Header Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 dark:border-slate-800 pb-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400 shrink-0">
                <Sparkles className="h-5 w-5" />
              </span>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 truncate">
                Klimatologi &amp; Dinamika Iklim
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
              Analisis klimatologi komprehensif: observasi stasiun, reanalisis ERA5, indeks ekstrem ETCCDI/SPI, dan agrometeorologi.
            </p>
          </div>

          {/* Location Chip */}
          <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 shadow-2xs self-start sm:self-auto shrink-0 max-w-full">
            <span className="h-2 w-2 rounded-full bg-teal-500 animate-pulse shrink-0" />
            <span className="font-medium text-slate-800 dark:text-slate-200 truncate max-w-[180px] sm:max-w-[240px]">
              {ws.activeLocation.name}
            </span>
            <span className="text-slate-400 font-mono shrink-0">
              ({ws.activeCoords.lat.toFixed(2)}°, {ws.activeCoords.lng.toFixed(2)}°)
            </span>
          </div>
        </div>

        {/* 3. Workspace Tab Navigation */}
        <Tabs
          value={ws.activeTab}
          onValueChange={(val) => ws.setActiveTab(val as ClimatologyWorkspaceTab)}
          className="w-full space-y-5"
        >
          <div className="overflow-x-auto pb-1">
            <TabsList className="bg-slate-200/70 dark:bg-slate-800/70 p-1 rounded-xl h-auto gap-1 inline-flex flex-nowrap sm:flex-wrap w-max sm:w-auto">
              <TabsTrigger
                value="ringkasan"
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:shadow-xs transition"
              >
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                <span>Ringkasan</span>
              </TabsTrigger>
              <TabsTrigger
                value="observasi"
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:shadow-xs transition"
              >
                <Activity className="h-3.5 w-3.5 text-teal-500" />
                <span>Observasi</span>
              </TabsTrigger>
              <TabsTrigger
                value="reanalisis"
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:shadow-xs transition"
              >
                <Globe className="h-3.5 w-3.5 text-sky-500" />
                <span>Reanalisis ERA5</span>
              </TabsTrigger>
              <TabsTrigger
                value="ekstrem-hidro"
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:shadow-xs transition"
              >
                <ShieldAlert className="h-3.5 w-3.5 text-rose-500" />
                <span>Ekstrem & Hidrologi</span>
              </TabsTrigger>
              <TabsTrigger
                value="agroklimat"
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:shadow-xs transition"
              >
                <Sprout className="h-3.5 w-3.5 text-emerald-500" />
                <span>Agroklimat</span>
              </TabsTrigger>
            </TabsList>
          </div>

          {/* 4. Active Workspace Views */}
          <div className="transition-all duration-200">
            {ws.activeTab === "ringkasan" && <OverviewWorkspace ws={ws} />}
            {ws.activeTab === "observasi" && <ObservationWorkspace ws={ws} />}
            {ws.activeTab === "reanalisis" && <ReanalysisWorkspace ws={ws} />}
            {ws.activeTab === "ekstrem-hidro" && <ExtremesHydroWorkspace ws={ws} />}
            {ws.activeTab === "agroklimat" && <AgrometWorkspace ws={ws} />}
          </div>
        </Tabs>
      </div>
    </div>
  );
}

export default function ClimatologyPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[50vh] w-full items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-teal-600 dark:text-teal-400" />
        </div>
      }
    >
      <ClimatologyWorkspaceContent />
    </Suspense>
  );
}
