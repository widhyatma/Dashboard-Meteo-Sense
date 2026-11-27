"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import { Inter } from "next/font/google"
import { LayoutDashboard, Network, FileText, Database, Earth, Sprout, ChartNoAxesCombined, User, CloudRain } from "lucide-react"
import { useAuth } from "@/hooks/useAuth"
import { signOutUser } from "@/lib/FetchingAuth"
import { Sidebar } from "@/components/dashboard/Sidebar"
import { Topbar } from "@/components/dashboard/Topbar"
import { dashboardNavigation } from "@/lib/navigation"
import { NodeHealthProvider } from "@/context/NodeHealthContext"
import Loading from "@/app/loading"
import { cn } from "@/lib/utils"
const inter = Inter({ subsets: ["latin"] });

const SIDEBAR_COLLAPSE_KEY = "meteo_dash_sidebar_collapsed"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, profile, loading, logout } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(SIDEBAR_COLLAPSE_KEY)
      if (saved === "true") setSidebarCollapsed(true)
    } catch {}
  }, [])

  const handleToggleCollapse = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev
      try {
        window.localStorage.setItem(SIDEBAR_COLLAPSE_KEY, String(next))
      } catch {}
      return next
    })
  }

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        const tag = (e.target as HTMLElement | null)?.tagName
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return
        e.preventDefault()
        handleToggleCollapse()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  const navigation = dashboardNavigation.filter(item =>
    item.roles?.includes(profile?.role || 'User')
  )

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login")
      return
    }

    if (!loading && profile) {
      const currentRoute = dashboardNavigation.find(item => item.href === pathname)
      if (currentRoute && !currentRoute.roles?.includes(profile.role)) {
        // If user tries to access a page they don't have permission for, redirect them.
        router.push('/dashboard')
      }
    }
  }, [user, profile, loading, router, pathname])

  const handleLogout = async () => {
    try {
      await logout()
    } catch (error) {
      console.error("Logout error:", error)
    }
  }

  if (loading) {
    return <Loading/>
  }

  if (!user || !profile) {
    return null
  }

  // The navigation constant is now filtered above based on role.
  // const navigation: NavigationItem[] = [ ... ] // This is removed.

  return (
    <NodeHealthProvider>
      <div className="min-h-screen bg-gray-100 dark:bg-gray-950">
        {/* Topbar now spans full width */}
        <Topbar 
          user={user} 
          profile={profile} 
          setSidebarOpen={setSidebarOpen} 
          handleLogout={handleLogout}
          navigation={navigation}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebarCollapse={handleToggleCollapse}
        />

        {/* Mobile Drawer (active on small screens) */}
        <div className="lg:hidden">
          <Sidebar 
            navigation={navigation}
            sidebarOpen={sidebarOpen}
            setSidebarOpen={setSidebarOpen}
          />
        </div>

        {/* Content area with sidebar and main content */}
        <div className="flex h-[calc(100dvh-4rem)]">
          {/* Sidebar - collapsible fixed position on desktop */}
          <aside
            className={cn(
              "hidden lg:block flex-shrink-0 h-[calc(100dvh-4rem)] overflow-hidden transition-all duration-300 ease-in-out",
              sidebarCollapsed ? "lg:w-[5.25rem]" : "lg:w-64"
            )}
          >
            <Sidebar 
              navigation={navigation}
              sidebarOpen={false}
              setSidebarOpen={setSidebarOpen}
              collapsed={sidebarCollapsed}
              onToggleCollapse={handleToggleCollapse}
            />
          </aside>

          {/* Main content - scrollable with min-w-0 to prevent flex blowout */}
          <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden">
            <main className="py-4 sm:py-6">
              <div className="px-3 sm:px-6 lg:px-8 max-w-full">{children}</div>
            </main>
          </div>
        </div>
      </div>
    </NodeHealthProvider>
  )
}