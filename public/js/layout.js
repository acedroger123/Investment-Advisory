(function () {
    const collapseStorageKey = "aiwealth.sidebarCollapsed";
    const body = document.body;
    const sidebar = document.querySelector(".navbar");
    const toggleButton = sidebar ? sidebar.querySelector("[data-sidebar-toggle]") : null;
    const navLinksContainer = sidebar ? sidebar.querySelector(".nav-links") : null;

    if (!body || !sidebar || !toggleButton || !navLinksContainer) {
        return;
    }

    const icon = (paths) => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
    const defaultIcon = icon("<path d='M5 12h14'/><path d='M12 5v14'/>");
    const navIconMap = {
        dashboard: icon("<path d='M3 10.5 12 3l9 7.5'/><path d='M5 9.5V21h14V9.5'/>"),
        portfolio: icon("<rect x='3' y='6' width='18' height='13' rx='2'/><path d='M3 10h18'/><path d='M16 14h2'/>"),
        goals: icon("<circle cx='12' cy='12' r='8'/><circle cx='12' cy='12' r='4'/><circle cx='12' cy='12' r='1.2'/>"),
        transactions: icon("<path d='M17 3l4 4-4 4'/><path d='M21 7H9'/><path d='M7 21l-4-4 4-4'/><path d='M3 17h12'/>"),
        rebalance: icon("<path d='M12 3v9h9'/><path d='M20.5 12A8.5 8.5 0 1 1 11.5 3'/>"),
        simulation: icon("<path d='M3 13h4l3-6 4 12 3-6h4'/>"),
        expenses: icon("<rect x='3' y='6' width='18' height='12' rx='2'/><path d='M3 10h18'/>"),
        "ai advice": icon("<path d='M12 3l2.5 5.5L20 11l-5.5 2.5L12 19l-2.5-5.5L4 11l5.5-2.5Z'/>"),
        review: icon("<path d='M20 6 9 17l-5-5'/>"),
        settings: icon("<circle cx='12' cy='12' r='3'/><path d='M12 2v3'/><path d='M12 19v3'/><path d='M4.9 4.9l2.1 2.1'/><path d='M17 17l2.1 2.1'/><path d='M2 12h3'/><path d='M19 12h3'/><path d='M4.9 19.1 7 17'/><path d='M17 7l2.1-2.1'/>")
    };
    const logoutIcon = icon("<path d='M10 17l-5-5 5-5'/><path d='M5 12h10'/><path d='M15 4h5v16h-5'/>");

    const getStorage = (key) => {
        try {
            return window.localStorage.getItem(key);
        } catch (error) {
            return null;
        }
    };

    const setStorage = (key, value) => {
        try {
            window.localStorage.setItem(key, value);
        } catch (error) {
            // Ignore storage failures (private mode / restrictions).
        }
    };

    const navBrand = sidebar.querySelector(".nav-brand");
    if (navBrand) {
        const brandText = navBrand.querySelector(".brand-text");
        if (brandText && !navBrand.querySelector(".brand-copy")) {
            const copy = document.createElement("div");
            copy.className = "brand-copy";
            brandText.parentNode.insertBefore(copy, brandText);
            copy.appendChild(brandText);

            const subtext = document.createElement("span");
            subtext.className = "brand-subtext";
            subtext.textContent = "Investment Workspace";
            copy.appendChild(subtext);
        }
    }

    if (!sidebar.querySelector(".sidebar-footer")) {
        const footer = document.createElement("div");
        footer.className = "sidebar-footer";
        footer.innerHTML = `
            <a class="sidebar-utility-link" href="SignIn.html">
                <span class="utility-icon" aria-hidden="true">${logoutIcon}</span>
                <span class="utility-label">Logout</span>
            </a>
        `;
        sidebar.appendChild(footer);
    }

    const links = Array.from(navLinksContainer.querySelectorAll(".nav-link"));
    links.forEach((link) => {
        const label = (link.getAttribute("data-label") || link.textContent || "").trim();
        if (!label) {
            return;
        }

        link.setAttribute("data-label", label);
        link.setAttribute("title", label);

        if (!link.querySelector(".nav-link-label")) {
            const navIcon = document.createElement("span");
            navIcon.className = "nav-link-icon";
            navIcon.innerHTML = navIconMap[label.toLowerCase()] || defaultIcon;

            const navLabel = document.createElement("span");
            navLabel.className = "nav-link-label";
            navLabel.textContent = label;

            link.textContent = "";
            link.append(navIcon, navLabel);
        }
    });

    const mediaQuery = window.matchMedia("(max-width: 1024px)");
    const persistedCollapse = getStorage(collapseStorageKey);
    let isCollapsed = persistedCollapse === null ? mediaQuery.matches : persistedCollapse === "true";

    const toggleIcon = toggleButton.querySelector(".sidebar-toggle-icon");

    const applyState = () => {
        body.classList.add("sidebar-theme-dark");
        body.classList.toggle("sidebar-collapsed", isCollapsed);

        toggleButton.setAttribute("aria-expanded", String(!isCollapsed));
        toggleButton.setAttribute(
            "aria-label",
            isCollapsed ? "Expand sidebar" : "Collapse sidebar"
        );
        if (toggleIcon) {
            toggleIcon.textContent = isCollapsed ? ">" : "<";
        }
    };

    toggleButton.addEventListener("click", () => {
        isCollapsed = !isCollapsed;
        setStorage(collapseStorageKey, String(isCollapsed));
        applyState();
    });

    if (persistedCollapse === null) {
        const handleViewportChange = (event) => {
            isCollapsed = event.matches;
            applyState();
        };

        if (typeof mediaQuery.addEventListener === "function") {
            mediaQuery.addEventListener("change", handleViewportChange);
        } else if (typeof mediaQuery.addListener === "function") {
            mediaQuery.addListener(handleViewportChange);
        }
    }

    applyState();
})();
