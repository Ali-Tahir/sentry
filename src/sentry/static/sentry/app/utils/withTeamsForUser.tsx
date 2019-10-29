import React from 'react';
import _ from 'lodash';

import {Client} from 'app/api';
import {Organization, Project, Team} from 'app/types';
import getDisplayName from 'app/utils/getDisplayName';
import ProjectActions from 'app/actions/projectActions';
import ConfigStore from 'app/stores/configStore';
import TeamActions from 'app/actions/teamActions';

// We require these props when using this HOC
type DependentProps = {
  api: Client;
  organization: Organization;
};

type InjectedTeamsProps = {
  teams: Team[];
  loadingTeams: boolean;
  error: Error | null;
};

const withTeamsForUser = <P extends InjectedTeamsProps>(
  WrappedComponent: React.ComponentType<P>
) =>
  class extends React.Component<
    Omit<P, keyof InjectedTeamsProps> & Partial<InjectedTeamsProps> & DependentProps,
    InjectedTeamsProps
  > {
    static displayName = `withUsersTeams(${getDisplayName(WrappedComponent)})`;

    state = {
      teams: [],
      loadingTeams: true,
      error: null,
    };

    componentDidMount() {
      this.fetchTeams();
    }

    async fetchTeams() {
      // check if we can use organization teams/projects instead of fetching data
      const {projects} = this.props.organization;
      let {teams} = this.props.organization;
      if (projects && teams) {
        const {isSuperuser} = ConfigStore.get('user');
        this.populateTeamsWithProjects(teams, projects, isSuperuser);
        this.setState({
          teams,
          loadingTeams: false,
        });
        return;
      }

      this.setState({
        loadingTeams: true,
      });
      try {
        teams = await this.props.api.requestPromise(this.getUsersTeamsEndpoint());
        this.setState({
          teams,
          loadingTeams: false,
        });

        // also fill up TeamStore so org context does not have to refetch org
        // details due to lack of teams/projects
        TeamActions.loadTeams(teams);
      } catch (error) {
        this.setState({
          error,
          loadingTeams: false,
        });
      }
    }

    populateTeamsWithProjects(teams: Team[], projects: Project[], isSuperuser: boolean) {
      const projectsByTeam = {};
      let usersTeams = new Set(
        teams.filter(team => team.isMember).map(team => team.slug)
      );
      if (usersTeams.size === 0 && isSuperuser) {
        usersTeams = new Set(teams.map(team => team.slug));
      }

      projects.forEach(project => {
        if (project.teams.length || project.isMember) {
          project.teams.forEach(team => {
            if (!usersTeams.has(team.slug)) {
              return;
            }
            if (!projectsByTeam.hasOwnProperty(team.slug)) {
              projectsByTeam[team.slug] = [];
            }
            projectsByTeam[team.slug].push(project);
          });
        }
      });

      teams.forEach(team => {
        team.projects = projectsByTeam[team.slug] || [];
      });
    }

    getUsersTeamsEndpoint() {
      return `/organizations/${this.props.organization.slug}/user-teams/`;
    }

    render() {
      return <WrappedComponent {...this.props as (P & DependentProps)} {...this.state} />;
    }
  };

export default withTeamsForUser;
