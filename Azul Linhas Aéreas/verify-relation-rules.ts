declare var VSS: any;

export async function verifyRelationsRules(workItemFormSvc) {

  return new Promise(async (resolve, reject) => {
    const workItemType = await workItemFormSvc.getFieldValue(['System.WorkItemType'])
    const workItemId = await workItemFormSvc.getFieldValue(['System.Id'])

    const relations = await workItemFormSvc.getWorkItemRelations()

    const relationsToVerify = []

    for (let i = 0; i < relations.length; i++) {
      const relation = relations[i];

      const isOldRelation = !relation.attributes.isDeleted && !relation.attributes.isNew
      const isNewRelation = relation.attributes.isNew

      if ( isOldRelation || isNewRelation ) {
        relationsToVerify.push(relation)
      }
    }

    if ( !relationsToVerify.find(relation => relation.rel == 'System.LinkTypes.Hierarchy-Reverse') ) {
      console.info(workItemType)
      switch (workItemType) {
        case 'Task':
        case 'User Story':
        case 'Feature':
        case 'Release':
        case 'Issue':
        case 'Bug':
        case 'Meetings':
        case 'Architecture':
          return reject('Relacionamento parent é obrigatório')
      }

    }

    if ( workItemType == 'Feature' && relationsToVerify.filter(relation => relation.rel == 'System.LinkTypes.Related-Forward').length > 1 ) {
      return reject('Relacionamento inválido: Work Items do tipo Feature só podem ter um relacionamento Related')
    }

    if (workItemType == 'Meetings' && relationsToVerify.filter(relation => relation.rel == 'System.LinkTypes.Hierarchy-Reverse').length > 1) {
      return reject('Relacionamento inválido: Work Items do tipo Meetings só podem ter um relacionamento Parent')
    }

    if ( relationsToVerify.length > 0 ) {

      return VSS.require(['VSS/Service', 'TFS/WorkItemTracking/RestClient'], async function(VSS_Service, TFS_Wit_WebApi) {
        const witClient = VSS_Service.getCollectionClient(TFS_Wit_WebApi.WorkItemTrackingHttpClient)

        const relatedWorkItems = []

        for (let i = 0; i < relationsToVerify.length; i++) {
          const relation = relationsToVerify[i]

          const relationInfo = getRelationInfo(relation)

          relatedWorkItems.push({
            id: relationInfo.id,
            linkType: relationInfo.linkType,
            relation: relation
          })

        }

        let relatedWorkItemsDetails

        try {
          relatedWorkItemsDetails = await witClient.getWorkItems([relatedWorkItems.map(relatedWorkItem => relatedWorkItem.id)], null, null, 'All')
        } catch (err) {
          console.error('Erro na verificação das regras de relacionamento')
          console.error(err)
          return resolve()
        }

        for (let i = 0; i < relatedWorkItems.length; i++) {

          const relatedWorkItem = relatedWorkItems[i]

          const relatedWorkItemDetails = relatedWorkItemsDetails.find(relatedWorkItemDetails => relatedWorkItemDetails.id == relatedWorkItem.id)

          if ( relatedWorkItem.relation.attributes.isNew && relatedWorkItemDetails.fields['System.State'] == 'Closed' ) {
            return reject(`Relacionamentos não podem ser feitos em Work Items Closed (${relatedWorkItem.id})`)
          }

          if ( relatedWorkItem.linkType == 'System.LinkTypes.Hierarchy-Reverse' ) {

            switch (workItemType) {
              case 'Task':
                if ( relatedWorkItemDetails.fields['System.WorkItemType'] != 'User Story' && relatedWorkItemDetails.fields['System.WorkItemType'] != 'Support' ) {
                  return reject('Relacionamento inválido: Work Items do tipo Task só podem ter parent User Story ou Support')
                }
                break;
              case 'User Story':
                if (relatedWorkItemDetails.fields['System.WorkItemType'] != 'Feature' && relatedWorkItemDetails.fields['System.WorkItemType'] != 'Meetings') {
                  return reject('Relacionamento inválido: Work Items do tipo User Story só podem ter parent Feature')
                }
                break;
              case 'Feature':
                if (relatedWorkItemDetails.fields['System.WorkItemType'] != 'Epic' && relatedWorkItemDetails.fields['System.WorkItemType'] != 'Initiatives' && relatedWorkItemDetails.fields['System.WorkItemType'] != 'Release') {
                  return reject('Relacionamento inválido: Work Items do tipo Feature só podem ter parent Epic, Release ou Initiatives')
                }
                break;
              case 'Meetings':
                if (relatedWorkItemDetails.fields['System.WorkItemType'] != 'Epic' && relatedWorkItemDetails.fields['System.WorkItemType'] != 'Initiatives' && relatedWorkItemDetails.fields['System.WorkItemType'] != 'Release') {
                  return reject('Relacionamento inválido: Work Items do tipo Meetings só podem ter parent Epic, Release ou Initiatives')
                }
                break;
              case 'Release':
                if ( relatedWorkItemDetails.fields['System.WorkItemType'] != 'Epic' ) {
                  return reject('Relacionamento inválido: Work Items do tipo Release só podem ter parent Epic')
                }
                break;
              case 'Architecture':
                if ( relatedWorkItemDetails.fields['System.WorkItemType'] != 'Feature' ) {
                  return reject('Relacionamento inválido: Work Items do tipo Architecture só podem ter parent Feature')
                }
                break;
            }

          } else if ( relatedWorkItem.linkType == 'System.LinkTypes.Related-Forward' ) {

            switch (workItemType) {
              case 'Feature':
                if (relatedWorkItemDetails.fields['System.WorkItemType'] != 'Release' && relatedWorkItemDetails.fields['System.WorkItemType'] != 'Feature' ) {
                  return reject('Relacionamento inválido: Work Items do tipo Feature só podem ter related Release ou Feature')
                }
                break;
              case 'Release':
                if ( relatedWorkItemDetails.fields['System.WorkItemType'] == 'Feature' ) {
                  for (let j = 0; j < relatedWorkItemDetails.relations.length; j++) {
                    const relatedRelation = relatedWorkItemDetails.relations[j];

                    const relatedRelationInfo = getRelationInfo(relatedRelation)

                    if ( relatedRelationInfo.linkType == 'System.LinkTypes.Related' && relatedRelationInfo.id != workItemId ) {
                      return reject(`Relacionamento inválido: Feature ${relatedWorkItemDetails.id} está related com outro Work Item`)
                    }

                  }
                } else {
                  return reject('Relacionamento inválido: Work Items do tipo Release só podem ter related Feature')
                }
                break;
            }

          }
        }

        return resolve()

      });
    }

    return resolve()

  })

}

const getRelationInfo = (relation) => {
  const relationUrlSplited = relation.url.split('/')
  const relatedWorkItemId = relationUrlSplited[relationUrlSplited.length - 1]

  return {
    id: relatedWorkItemId,
    linkType: relation.rel
  }
}