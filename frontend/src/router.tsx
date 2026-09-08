/** 路由表（03 §3.3）：全部页面路由，懒加载按页面分包 */
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { lazy } from 'react';
import { AppShell } from './layout/app-shell';

const DashboardPage = lazy(() => import('./pages/dashboard-page').then((m) => ({ default: m.DashboardPage })));
const BasicInfoPage = lazy(() => import('./pages/basic-info-page').then((m) => ({ default: m.BasicInfoPage })));
const PortfolioPage = lazy(() => import('./pages/portfolio-page').then((m) => ({ default: m.PortfolioPage })));
const ProjectsPage = lazy(() => import('./pages/projects-page').then((m) => ({ default: m.ProjectsPage })));
const ProjectDetailPage = lazy(() => import('./pages/project-detail-page').then((m) => ({ default: m.ProjectDetailPage })));
const JdNewPage = lazy(() => import('./pages/jd-new-page').then((m) => ({ default: m.JdNewPage })));
const JdListPage = lazy(() => import('./pages/jd-list-page').then((m) => ({ default: m.JdListPage })));
const JdDetailPage = lazy(() => import('./pages/jd-detail-page').then((m) => ({ default: m.JdDetailPage })));
const ResumesPage = lazy(() => import('./pages/resumes-page').then((m) => ({ default: m.ResumesPage })));
const ResumeDetailPage = lazy(() => import('./pages/resume-detail-page').then((m) => ({ default: m.ResumeDetailPage })));
const ResumeStudioPage = lazy(() => import('./pages/resume-studio-page').then((m) => ({ default: m.ResumeStudioPage })));
const HrPage = lazy(() => import('./pages/hr-page').then((m) => ({ default: m.HrPage })));
const HrDetailPage = lazy(() => import('./pages/hr-detail-page').then((m) => ({ default: m.HrDetailPage })));
const ApplicationsPage = lazy(() => import('./pages/applications-page').then((m) => ({ default: m.ApplicationsPage })));
const InterviewsPage = lazy(() => import('./pages/interviews-page').then((m) => ({ default: m.InterviewsPage })));

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'assets/basic-info', element: <BasicInfoPage /> },
      { path: 'assets/portfolio', element: <PortfolioPage /> },
      { path: 'projects', element: <ProjectsPage /> },
      { path: 'projects/:projectId', element: <ProjectDetailPage /> },
      { path: 'jd', element: <JdListPage /> },
      { path: 'jd/new', element: <JdNewPage /> },
      { path: 'jd/:jdId', element: <JdDetailPage /> },
      { path: 'resumes', element: <ResumesPage /> },
      { path: 'resumes/:resumeId', element: <ResumeDetailPage /> },
      { path: 'resume-versions/:versionId', element: <ResumeStudioPage /> },
      { path: 'hr', element: <HrPage /> },
      { path: 'hr/:hrId', element: <HrDetailPage /> },
      { path: 'applications', element: <ApplicationsPage /> },
      { path: 'interviews', element: <InterviewsPage /> },
      { path: '*', element: <Navigate to="/dashboard" replace /> },
    ],
  },
]);