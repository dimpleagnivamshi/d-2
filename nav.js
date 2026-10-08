/* =====================================================
   HEADER + NAVIGATION

   Each page only needs:
   <div id="pageHeader"></div>
   and nav.js builds the title, description and the
   links to every page listed in pages.js.
   ===================================================== */

function currentFileName() {
    const path = window.location.pathname;
    const name = path.substring(path.lastIndexOf("/") + 1);

    if (name === "" ) {
        return "index.html";
    }

    return name;
}

function renderHeader() {
    const container = document.getElementById("pageHeader");

    if (!container) {
        return;
    }

    const activeFile = currentFileName();

    const page =
        PAGES.find(function (item) {
            return item.file === activeFile;
        }) || { title: document.title, description: "" };

    /* HEADER */
    const header = document.createElement("div");
    header.className = "header";

    const heading = document.createElement("h1");
    heading.textContent = page.title;
    header.appendChild(heading);

    if (page.description) {
        const text = document.createElement("p");
        text.textContent = page.description;
        header.appendChild(text);
    }

    /* NAVIGATION */
    const nav = document.createElement("nav");
    nav.className = "nav";

    PAGES.forEach(function (item) {
        const link = document.createElement("a");
        link.href = item.file;
        link.textContent = item.title;

        if (item.file === activeFile) {
            link.className = "active";
        }

        nav.appendChild(link);
    });

    header.appendChild(nav);
    container.appendChild(header);

    document.title = page.title + " | Sensor Data Analysis";
}

renderHeader();
