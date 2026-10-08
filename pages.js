/* =====================================================
   PAGE REGISTRY

   This is the ONLY place you register a new page.
   Add an entry here and it appears in the navigation
   bar of every page automatically.
   ===================================================== */

const PAGES = [
    {
        file: "index.html",
        title: "Graph Explorer",
        description: "Select the X-axis and Y-axis to visualize the sensor data."
    },
    {
        file: "dashboard.html",
        title: "Dashboard",
        description: "Multiple graphs for pressure and RPM data analysis."
    },
    {
        file: "pressure.html",
        title: "Pressure Analysis",
        description: "P1, P2 and dP behaviour over time."
    }

    /* ADD NEW PAGES BELOW, e.g.
    ,{
        file: "rpm.html",
        title: "RPM Analysis",
        description: "RPM behaviour and its relation to dP."
    }
    */
];
