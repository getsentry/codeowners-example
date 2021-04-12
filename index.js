const axios = require("axios");
const fs = require("fs").promises;
require('dotenv').config();

const teamMap = require("./team_map.json");
const userMap = require("./user_map.json");

axios.defaults.headers.common["Authorization"] = "Bearer " + process.env.SENTRY_TOKEN;
axios.defaults.baseURL = process.env.BASE_URL || "https://sentry.io";

const organization_slug = process.env.ORGANIZATION_SLUG;
const project_slug = process.env.PROJECT_SLUG;

class BaseApiClient {
  async get(url) {
    try {
      let res = await axios.get(url);
      return res.data;
    } catch (error) {
      console.log(error.response);
    }
  }

  async post(url, data) {
    try {
      let res = await axios.post(url, data);
      return res.data;
    } catch (error) {
      console.log(error.response);
    }
  }

  async put(url, data) {
    try {
      let res = await axios.put(url, data);
      return res.data;
    } catch (error) {
      console.log(error.response);
    }
  }

  async delete(url) {
    try {
      let res = await axios.delete(url);
      return res.data;
    } catch (error) {
      console.log(error.response);
    }
  }
}

class ApiClient extends BaseApiClient {
  constructor(organization_slug, project_slug) {
    super();
    this.organization_slug = organization_slug;
    this.project_slug = project_slug;
    this.team_slug = "";
  }
  // List Organization Users
  async getOrganizationUsers() {
    return this.get(`/api/0/organizations/${this.organization_slug}/users/`);
  }

  // Retrieve a Project
  async getProject() {
    return this
      .get(`/api/0/projects/${this.organization_slug}/${this.project_slug}/
    `);
  }
  async getProjectId() {
    let project = await this.getProject();
    return project.id;
  }

  // Retrieve a Team's Projects
  async getTeamProjects(team_slug) {
    return this
      .get(`/api/0/teams/${this.organization_slug}/${team_slug}/projects/
    `);
  }
  async checkTeamExistsOnProject(team_slug) {
    try {
      let projects = await this.getTeamProjects(team_slug);
      if (projects.find((project) => project.slug === this.project_slug)) {
        return true;
      }
      return false;
    } catch (error) {
      throw error;
    }
  }
  // External Teams
  async getExternalTeams() {
    return this.get(`/api/0/organizations/${this.organization_slug}/teams/`);
  }
  async createExternalTeam(data) {
    if (!this.team_slug) {
      throw new Error("Missing team slug!");
    }
    return this.post(
      `/api/0/teams/${this.organization_slug}/${this.team_slug}/externalteam/`,
      data
    );
  }
  async updateExternalTeam(external_team_id, data) {
    if (!this.team_slug) {
      throw new Error("Missing team slug!");
    }
    return this.put(
      `/api/0/teams/${this.organization_slug}/${this.team_slug}/externalteam/${external_team_id}/`,
      data
    );
  }

  // External Users
  async getExternalUsers() {
    return this.get(
      `/api/0/organizations/${this.organization_slug}/members/?expand=externalUsers`
    );
  }
  async createExternalUser(data) {
    return this.post(
      `/api/0/organizations/${this.organization_slug}/members/externaluser/`,
      data
    );
  }

  // Code Mapping
  async getCodeMappings(projectId) {
    return this.get(
      `/api/0/organizations/${this.organization_slug}/code-mappings/?projectId=${projectId}`
    );
  }
  async createCodeMapping(data) {
    return this.post(
      `/api/0/organizations/${this.organization_slug}/code-mappings/`,
      data
    );
  }

  // CodeOwners
  async createCodeOwners(data) {
    if (!this.project_slug) {
      throw new Error("Missing project slug!");
    }
    return this.post(
      `/api/0/projects/${this.organization_slug}/${this.project_slug}/codeowners/`,
      data
    );
  }
}

(async () => {
  try {
    const CODEOWNERS = await fs.readFile("./.github/CODEOWNERS", "utf8");

    const sentry = new ApiClient(organization_slug, project_slug);

    // Create the External Team associations for each Sentry team
    let missingTeams = [];
    await Promise.all(
      Object.entries(teamMap).map(async ([team_slug, externalNames]) => {
        let exists = await sentry.checkTeamExistsOnProject(team_slug);
        if (!exists) {
          missingTeams.push(team_slug);

          return;
        }
        sentry.team_slug = team_slug;
        await Promise.all(
          externalNames.map(async (externalName) => {
            await sentry.createExternalTeam({
              provider: "github", // can also be "gitlab"
              externalName,
            });
          })
        );
      })
    );

    if (missingTeams.length) {
      throw new Error(
        `The following teams are not associated with the project "${sentry.project_slug}":
        ${missingTeams.join(", ")}`
      );
    }

    // Create External User assocations for each Sentry user
    let users = await sentry.getOrganizationUsers();
    let emailMap = users.reduce((acc, curr) => {
      let { user, id } = curr;
      for (let { email } of user["emails"]) {
        if (acc[email]) {
          continue;
        }
        acc[email] = id;
      }
      return acc;
    }, {});

    let missingUsers = [];
    Object.entries(userMap).map(async ([email, externalNames]) => {
      if (!emailMap[email]) {
        missingUsers.push(email);
        return;
      }
      await Promise.all(
        externalNames.map(async (externalName) => {
          await sentry.createExternalUser({
            provider: "github", // can also be gitlab
            externalName,
            memberId: emailMap[email],
          });
        })
      );
    });

    if (missingUsers.length) {
      throw new Error(
        `The following users do not have accounts in Sentry:
        ${missingUsers.join(", ")}`
      );
    }

    let projectId = await sentry.getProjectId();
    let codeMappings = await sentry.getCodeMappings(projectId);
    if (!codeMappings.length) {
      throw new Error("You will need a Code Mapping to upload CodeOwners.");
    }

    // Upload CodeOwners
    await sentry.createCodeOwners({
      raw: CODEOWNERS,
      codeMappingId: codeMappings[0].id,
    });
    console.log("Successfully created CodeOwners")
  } catch (error) {
    console.log(error);
  }
})();
