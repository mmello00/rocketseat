declare var VSS: any;

export async function verifyFieldRules(workItemFormSvc) {

  return new Promise(async (resolve, reject) => {
    const workItemType = await workItemFormSvc.getFieldValue(['System.WorkItemType'])

    let msgError = null

    switch (workItemType) {
      case 'Release':
        msgError = await validateRelease(workItemFormSvc)
        break
      case 'Support':
        msgError = await validateSupport(workItemFormSvc)
        break
      case 'Feature':
        msgError = await validateFeature(workItemFormSvc)
        break
      case 'User Story':
        msgError = await validateUserStory(workItemFormSvc)
        break
      case 'Task':
        msgError = await validateTask(workItemFormSvc)
        break
      case 'Issue':
        msgError = await validateIssue(workItemFormSvc)
        break
      case 'Architecture':
        msgError = await validateArchitecture(workItemFormSvc)
        break
      case 'Meetings':
        msgError = await validateMeetings(workItemFormSvc)
        break
    }

    if ( msgError ) {
      return reject(msgError)
    }

    return resolve()

  })

}

const validateRelease = async (workItemFormSvc) => {
  let msg = null

  const effectiveDate = await workItemFormSvc.getFieldValue(['Custom.ReleaseEffectiveDate'])
  const targetDate = await workItemFormSvc.getFieldValue(['Custom.ReleaseTargetDate'])

  if ( effectiveDate && targetDate && effectiveDate > targetDate ) {
    const replanningReason = await workItemFormSvc.getFieldValue(['Custom.ReplanningReason'])

    if ( !replanningReason ) {
      msg = 'Campo \'Replanning Reason\' é obrigatório.'
    }
  }

  const systemState = await workItemFormSvc.getFieldValue(['System.State'])

  if ( ['Closed'].indexOf(systemState) !== -1 ) {
    const workItemsWithoutStatus = await getWorkItemsRelationWithoutStatus(workItemFormSvc, 'System.LinkTypes.Related-Forward', 'Feature', ['Closed', 'Removed'])

    if ( workItemsWithoutStatus.length > 0 ) {
      msg = 'Work Item ('
      msg += workItemsWithoutStatus.join(', ')
      msg += ') não está Closed.'
    }
  }

  return msg
}

const validateSupport = async (workItemFormSvc) => {
  let msg = null

  const systemState = await workItemFormSvc.getFieldValue(['System.State'])

  if ( ['Closed', 'Homologation'].indexOf(systemState) !== -1 ) {
    const workItemsWithoutStatus = await getWorkItemsRelationWithoutStatus(workItemFormSvc, 'System.LinkTypes.Hierarchy-Forward', 'Task', ['Closed', 'Removed'])

    if ( workItemsWithoutStatus.length > 0 ) {
      msg = 'Work Item ('
      msg += workItemsWithoutStatus.join(', ')
      msg += ') não está Closed.'
    }

  }

  return msg

}

const validateFeature = async (workItemFormSvc) => {
  let msg = null

  const systemState = await workItemFormSvc.getFieldValue(['System.State'])

  if ( ['Closed'].indexOf(systemState) !== -1 ) {
    const workItemsWithoutStatus = await getWorkItemsRelationWithoutStatus(workItemFormSvc, 'System.LinkTypes.Hierarchy-Forward', 'User Story', ['Closed', 'Removed'])

    if ( workItemsWithoutStatus.length > 0 ) {
      msg = 'Work Item ('
      msg += workItemsWithoutStatus.join(', ')
      msg += ') não está Closed.'
    }
  }

  return msg
}

const validateMeetings = async (workItemFormSvc) => {
  let msg = null

  const systemState = await workItemFormSvc.getFieldValue(['System.State'])

  if ( ['Closed'].indexOf(systemState) !== -1 ) {
    const workItemsWithoutStatus = await getWorkItemsRelationWithoutStatus(workItemFormSvc, 'System.LinkTypes.Hierarchy-Forward', 'All', ['Closed', 'Removed'])

    if ( workItemsWithoutStatus.length > 0 ) {
      msg = 'Work Item ('
      msg += workItemsWithoutStatus.join(', ')
      msg += ') não está Closed.'
    }
  }

  return msg
}

const validateUserStory = async (workItemFormSvc) => {
  let msg = null

  const systemState = await workItemFormSvc.getFieldValue(['System.State'])

  if ( ['Active'].indexOf(systemState) !== -1 ) {
    const workItemsWithStatus = await getWorkItemsRelationWithStatus(workItemFormSvc, 'System.LinkTypes.Hierarchy-Reverse', 'Feature', ['Closed', 'Removed', 'New'])

    if ( workItemsWithStatus.length > 0 ) {
      msg = 'Work Item ('
      msg += workItemsWithStatus.join(', ')
      msg += ') está Closed, Removed ou New.'
    }
  }

  if ( ['Closed'].indexOf(systemState) !== -1 ) {
    const workItemsWithoutStatus = await getWorkItemsRelationWithoutStatus(workItemFormSvc, 'System.LinkTypes.Hierarchy-Forward', 'All', ['Closed', 'Removed'])

    if ( workItemsWithoutStatus.length > 0 ) {
      msg = 'Work Item ('
      msg += workItemsWithoutStatus.join(', ')
      msg += ') não está Closed.'
    }
  }

  await updateUserStoryTimeSums(workItemFormSvc);

  return msg
}

const validateIssue = async (workItemFormSvc) => {
  let msg = null

  const systemState = await workItemFormSvc.getFieldValue(['System.State'])

  if ( ['Active'].indexOf(systemState) !== -1 ) {
    const workItemsWithStatus = await getWorkItemsRelationWithStatus(workItemFormSvc, 'System.LinkTypes.Hierarchy-Reverse', 'All', ['Closed', 'Removed'])

    if ( workItemsWithStatus.length > 0 ) {
      msg = 'Work Item ('
      msg += workItemsWithStatus.join(', ')
      msg += ') está Closed ou Removed.'
    }
  }

  return msg

}

const validateTask = async (workItemFormSvc) => {
  let msg = null

  const systemState = await workItemFormSvc.getFieldValue(['System.State'])

  const closedDateFieldValue = await workItemFormSvc.getFieldValue(['Microsoft.VSTS.Common.ClosedDate'])

  let closedDate = null

  try {
    closedDate = new Date(closedDateFieldValue)
  } catch (error) {}

  if (['Closed'].indexOf(systemState) !== -1 && closedDate != null) {

    const nowDate = new Date()

    const limitChangeDate = new Date(closedDate.getFullYear(), closedDate.getMonth() + 1, 0, 23, 59, 59)

    if (nowDate > limitChangeDate) {
      const completedWorkFieldValue = await workItemFormSvc.getFieldValue(['Microsoft.VSTS.Scheduling.CompletedWork'])

      const lastRevisionNumber = await workItemFormSvc.getRevision()

      const workItemId = await workItemFormSvc.getFieldValue(['System.Id'])

      let lastRevisionCompletedWorkFieldValue

      await new Promise(resolve => {
        VSS.require(['VSS/Service', 'TFS/WorkItemTracking/RestClient'], async function(VSS_Service, TFS_Wit_WebApi) {
          const witClient = VSS_Service.getCollectionClient(TFS_Wit_WebApi.WorkItemTrackingHttpClient)

          const lastRevision = await witClient.getRevision(workItemId, lastRevisionNumber, 'All')

          lastRevisionCompletedWorkFieldValue = lastRevision.fields['Microsoft.VSTS.Scheduling.CompletedWork']

          resolve()
        })
      })

      if (completedWorkFieldValue != lastRevisionCompletedWorkFieldValue) {
        msg = 'Completed Work só pode ser alterado no mês em que a task foi para o status closed.'
      }
    }

  }

  // Extração de informações
  const completedWork = await workItemFormSvc.getFieldValue(['Microsoft.VSTS.Scheduling.CompletedWork'])
  const originalEstimate = await workItemFormSvc.getFieldValue(['Microsoft.VSTS.Scheduling.OriginalEstimate'])
  const justificativa = await workItemFormSvc.getFieldValue(['Custom.Justificativa']) // Mudar aqui 
  const unchangedOriginalEstimate = await workItemFormSvc.getFieldValue(['Microsoft.VSTS.Scheduling.OriginalEstimate'], {returnOriginalValue: true})

  // Não ser possível apontar mais do que “8 horas” no “Completed Work” da Task 
  if (completedWork > 8.0) {
    msg = 'Completed Work não pode ser maior que 8 horas.'
  }

  // Quando o Completed Work for 20% maior do que o “Original Estimate”, deverá ser preenchido um campo de “Justificativa”, que será obrigatório 
  if (completedWork > 1.2 * originalEstimate) {
    const justificativaVazia: RegExp = /^<div>((<br><\/div><div>)*|(<\/div><div>)*|(&nbsp;)*| *)*<br> *<\/div>$/ // /<div><br> <\/div>
    if (!justificativa || justificativa.match(justificativaVazia)) {
      msg = 'Justificativa não pode ser nula caso o Completed Work seja 20% maior que o Original Estimate.'
    }
  }

  // Amarrar a fábrica de software que possui na Task ao prefixo do e-mail do “Assigned To”
  // await setFactoryBasedOnEmail(workItemFormSvc);

  // Não poder alterar o “Original Estimate” depois de inserido 
  // if (unchangedOriginalEstimate && unchangedOriginalEstimate != originalEstimate) {
  //   msg = 'Original Estimate não pode ser alterado após definição. Valor original: ' + unchangedOriginalEstimate
  // }

  return msg
}

const validateArchitecture = async (workItemFormSvc) => {

  let msg = null

  const workWeightMap = {
    XS: 2,
    S: 3,
    M: 5,
    L: 8,
    XL: 13
  }

  const businessPriorityMap = {
    Low: 1,
    Medium: 2,
    High: 3
  }

  const workWeight = await workItemFormSvc.getFieldValue(['Custom.WorkWeight'])

  if ( workWeight ) {
    const businessPriority = await workItemFormSvc.getFieldValue(['Custom.BusinessPriority'])

    const effortCalculationValue = businessPriorityMap[businessPriority] * workWeightMap[workWeight]

    await workItemFormSvc.setFieldValue('Custom.EffortCalculation', effortCalculationValue)
  }

  return msg

}

const getWorkItemsRelationWithoutStatus = async (workItemFormSvc, relationType, workItemType, workItemStatusList) => {
  const relatedWorkItemsDetails = await getRelations(workItemFormSvc, relationType)

  const workItemsWithoutStatus = []

  if ( relatedWorkItemsDetails ) {
    for (let i = 0; i < relatedWorkItemsDetails.length; i++) {
      const relatedWorkItemDetails = relatedWorkItemsDetails[i]

      if ( (workItemType == 'All' || relatedWorkItemDetails.fields['System.WorkItemType'] == workItemType) && workItemStatusList.indexOf(relatedWorkItemDetails.fields['System.State']) === -1 ) {
        workItemsWithoutStatus.push(relatedWorkItemDetails.id)
      }

    }
  }

  return workItemsWithoutStatus
}

const getWorkItemsRelationWithStatus = async (workItemFormSvc, relationType, workItemType, workItemStatusList) => {
  const relatedWorkItemsDetails = await getRelations(workItemFormSvc, relationType)

  const workItemsWithStatus = []

  if ( relatedWorkItemsDetails ) {
    for (let i = 0; i < relatedWorkItemsDetails.length; i++) {
      const relatedWorkItemDetails = relatedWorkItemsDetails[i]

      if ( (workItemType == 'All' || relatedWorkItemDetails.fields['System.WorkItemType'] == workItemType) && workItemStatusList.indexOf(relatedWorkItemDetails.fields['System.State']) > -1 ) {
        workItemsWithStatus.push(relatedWorkItemDetails.id)
      }

    }
  }

  return workItemsWithStatus
}

const getRelations = async (workItemFormSvc, relationType) => {
  const relations = await workItemFormSvc.getWorkItemRelations()

  const relatedWorkItemIds = []

  for (let i = 0; i < relations.length; i++) {
    const relation = relations[i];

    if ( relation.attributes.isDeleted ) {
      continue
    }

    const relationInfo = getRelationInfo(relation)

    if ( relationType == 'All' ) {
      relatedWorkItemIds.push(relationInfo.id)
    } else if ( relation.rel == relationType ) {
      relatedWorkItemIds.push(relationInfo.id)
    }

  }

  return await new Promise(async (resolve, reject) => {

    if ( relatedWorkItemIds.length == 0 ) {
      return resolve(null)
    }

    return VSS.require(['VSS/Service', 'TFS/WorkItemTracking/RestClient'], async function(VSS_Service, TFS_Wit_WebApi) {
      const witClient = VSS_Service.getCollectionClient(TFS_Wit_WebApi.WorkItemTrackingHttpClient)

      try {
        const relatedWorkItemsDetails = await witClient.getWorkItems([relatedWorkItemIds], null, null, 'All')
        return resolve(relatedWorkItemsDetails)
      } catch (err) {
        console.error('Erro na busca dos relacionamentos')
        console.error(err)
        return resolve(null)
      }

    });

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

async function setFactoryBasedOnEmail(workItemFormSvc: any) {
  const assignedTo = await workItemFormSvc.getFieldValue(['System.AssignedTo']);
  const assignedToEmail = assignedTo.split('<')[1] || "";
  const assignedToEmailPrefix = assignedToEmail.split('.')[0].toLowerCase();
  const factoryMapping = {
    "5by5": "5BY5 CONSULTORIA EM TI LTDA.",
    "alpar": "ALPARSERVICE TECNOLOGIA LTDA",
    "aoo": "AOOP SOLUCOES DIGITAIS LTDA",
    "aunica": "AUNICA SOLUCOES DIGITAIS LTDA",
    "avanade": "AVANADE DO BRASIL LTDA",
    "b2e": "B2E SISTEMAS LTDA",
    "comexmind": "COMEXMIND CONSULTORIA EM TECNOLOGIA DA INFORMACAO LTDA",
    "cosin": "COSIN ASSOCIADOS CONSULTORIA E SERVICOS DE INFORMATICA S A",
    "e-component": "E COMPONENT INFORMATICA LTDA EPP",
    "enl": "ENLIGHTEN DO BRASIL SERVICOS DE INTELIGENCIA LTDA EPP",
    "extend": "EXTEND CONSULTORIA E SISTEMAS LTDA.",
    "fmi": "F DE A A MACIEL INFORMATICA",
    "facil": "FACIL INFORMATICA LTDA",
    "growtec": "GROWTEC TECNOLOGIA DA INFORMACAO LTDA",
    "gtac": "GTAC SOLUCOES EM SOFTWARE LTDA",
    "hdn": "HDN DIGITAL",
    "indra": "INDRA SISTEMAS AS",
    "itg": "IT GLOBAL SERVICES CONSULTORIA EM SISTEMAS DE INFORMATICA LTDA",
    "juniper": "JUNIPER CONSULTING. S.L.",
    "key": "KEYRUS BRASIL SERVICOS DE INFORMATICA LTDA",
    "konia": "KONIA CONSULTORIA EM INFORMATICA LTDA",
    "mgw": "MGW SISTEMAS DA INFORMAÇÃO LTDA",
    "mlpro": "MLPRO SOLUCOES EM TI LTDA EPP",
    "mooven": "MOOVEN ASSESSORIA E CONSULTORIA TECNICA EM INFORMATICA LTDA",
    "nsi": "NEW SOFT INFORMATICA LIMEIRA LTDA",
    "ninecon": "NINECON CONSULTORES ASSOCIADOS LTDA.",
    "pos": "POSSIBLE WORLDWIDE COMUNICACAO LTDA",
    "pri": "PRIME SISTEMAS DE ATENDIMENTO AO CONSUMIDOR LTDA.",
    "sk": "QUANTUMID BRASIL TECNOLOGIA LTDA.",
    "sabre": "SABRE AIRLINE SOLUTIONS",
    "satelial": "SATELITAL BRASIL COMERCIO LTDA",
    "scan": "SCAN BRAZIL CONSULTING LTDA",
    "trinapse": "TRINAPSE TECNOLOGIA LTDA ME",
    "wefit": "WEFIT TECNOLOGIA ESTRATEGICA LTDA",
    "enkel": "ENKEL INFORMATICA LTDA"
  };

  const factory = factoryMapping[assignedToEmailPrefix] || "AZUL LINHAS AÉREAS BRASILEIRAS";
  await workItemFormSvc.setFieldValue(['AgileAzul.Fabrica'], factory); // AgileAzul.Fabrica
}

async function updateUserStoryTimeSums(workItemFormSvc: any) {
  const relationsInfo = await getRelations(workItemFormSvc, 'System.LinkTypes.Hierarchy-Forward');
  let completedWorkSum = 0;
  let originalEstimateSum = 0;
  if (relationsInfo) {
    for (let i = 0; i < relationsInfo.length; i++) {
      const relation = relationsInfo[i];
      completedWorkSum += relation.fields['Microsoft.VSTS.Scheduling.CompletedWork'] || 0;
      originalEstimateSum += relation.fields['Microsoft.VSTS.Scheduling.OriginalEstimate'] || 0;
    }
    await workItemFormSvc.setFieldValue(['Custom.CompletedWorkTotal'], completedWorkSum); // Mudar aqui
    await workItemFormSvc.setFieldValue(['Custom.OriginalEstimateTotal'], originalEstimateSum); // Mudar aqui
  }
}
