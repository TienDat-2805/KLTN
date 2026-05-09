import {
  createRouter,
  createWebHashHistory,
  type RouteLocationNormalized,
  type RouteRecordRaw,
} from "vue-router";

const routes: RouteRecordRaw[] = [
  {
    path: "/",
    name: "home",
    component: () => import("../views/LandingView.vue"),
    meta: { scrollTo: "home" },
  },
  {
    path: "/app",
    component: () => import("../layouts/DashboardLayout.vue"),
    children: [
      { path: "", redirect: "/app/dashboard" },
      {
        path: "dashboard",
        name: "app-dashboard",
        component: () => import("../components/dashboard/Dashboard.vue"),
        meta: { title: "Tổng quan" },
      },
      {
        path: "settings",
        name: "app-settings",
        component: () => import("../components/dashboard/AccountSettings.vue"),
        meta: { title: "Cài đặt tài khoản" },
      },
      {
        path: "devices",
        name: "app-devices",
        component: () => import("../components/dashboard/Devices.vue"),
        meta: { title: "Quản lý thiết bị" },
      },
      {
        path: "devices/:id",
        name: "app-device-detail",
        component: () => import("../components/dashboard/DeviceDetail.vue"),
        meta: { title: "Chi tiết thiết bị" },
      },
      {
        path: "add-device",
        name: "app-add-device",
        component: () => import("../components/dashboard/AddDevice.vue"),
        meta: { title: "Thêm thiết bị" },
      },
    ],
  },
  {
    path: "/login",
    name: "login",
    component: () => import("../components/Auth/LoginView.vue"),
  },
  {
    path: "/signup",
    name: "signup",
    component: () => import("../components/Auth/SignupView.vue"),
  },
  {
    path: "/features",
    name: "features",
    component: () => import("../views/LandingView.vue"),
    meta: { scrollTo: "features" },
  },
  {
    path: "/about",
    name: "about",
    component: () => import("../views/LandingView.vue"),
    meta: { scrollTo: "about" },
  },
  {
    path: "/contact",
    name: "contact",
    component: () => import("../views/LandingView.vue"),
    meta: { scrollTo: "contact" },
  },
  { path: "/:pathMatch(.*)*", redirect: "/" },
];

function scrollToSection(id: string, behavior: ScrollBehavior = "smooth") {
  const element = document.getElementById(id);
  if (!element) return;
  element.scrollIntoView({ behavior, block: "start" });
}

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior(to: RouteLocationNormalized) {
    const id = to.meta?.scrollTo as string | undefined;
    if (!id) return { top: 0 };

    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          scrollToSection(id);
          resolve(false);
        });
      });
    });
  },
});

router.beforeEach((to) => {
  const token = sessionStorage.getItem("accessToken");
  const authed = Boolean(token && token.trim().length);

  if (to.path.startsWith("/app") && !authed) return { path: "/login" };
  if ((to.path === "/login" || to.path === "/signup") && authed)
    return { path: "/app/dashboard" };

  return true;
});

export const SECTION_ROUTES = [
  { id: "home", path: "/" },
  { id: "features", path: "/features" },
  { id: "about", path: "/about" },
  { id: "contact", path: "/contact" },
] as const;

export type SectionId = (typeof SECTION_ROUTES)[number]["id"];
