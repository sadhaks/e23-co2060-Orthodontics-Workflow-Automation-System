import React from 'react';
import { createBrowserRouter } from "react-router";
import { MainLayout } from "./layouts/MainLayout";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { PatientListPage } from "./pages/PatientListPage";
import { PatientProfilePage } from "./pages/PatientProfilePage";
import { ClinicQueuePage } from "./pages/ClinicQueuePage";
import { StudentCasesPage } from "./pages/StudentCasesPage";
import { ReportsPage } from "./pages/ReportsPage";
import { InventoryPage } from "./pages/InventoryPage";
import { SettingsPage } from "./pages/SettingsPage";

export const router = createBrowserRouter([
  {
    path: "/login",
    Component: LoginPage,
  },
  {
    path: "/",
    Component: MainLayout,
    children: [
      {
        index: true,
        Component: DashboardPage,
      },
      {
        path: "patients",
        Component: PatientListPage,
      },
      {
        path: "patients/:id",
        Component: PatientProfilePage,
      },
      {
        path: "queue",
        Component: ClinicQueuePage,
      },
      {
        path: "cases",
        Component: StudentCasesPage,
      },
      {
        path: "reports",
        Component: ReportsPage,
      },
      {
        path: "materials",
        Component: InventoryPage,
      },
      {
        path: "settings",
        Component: SettingsPage,
      },
    ],
  },
]);
