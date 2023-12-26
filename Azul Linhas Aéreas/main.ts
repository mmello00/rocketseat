declare var VSS: any
import { verifyRelationsRules } from './verify-relation-rules'
import { verifyFieldRules } from './verify-field-rules'

(() => {

  const validate = async (WorkItemServices) => {
    const workItemFormSvc = await WorkItemServices.WorkItemFormService.getService()

    try {
      workItemFormSvc.setError('Verificando regras de relacionamento')
      await verifyRelationsRules(workItemFormSvc)

      workItemFormSvc.setError('Verificando regras dos campos')
      await verifyFieldRules(workItemFormSvc)

      workItemFormSvc.clearError()
    } catch (err) {
      workItemFormSvc.setError(err)
    }
  }

  VSS.init({
    explicitNotifyLoaded: true,
    usePlatformScripts: true
  })

  VSS.ready(() => {
    VSS.require(['TFS/WorkItemTracking/Services'], (WorkItemServices) => {
      VSS.register(VSS.getContribution().id, () => {
        return {
          onLoaded: (args) => {
            validate(WorkItemServices)
          },
          onFieldChanged: (args) => {
            const fields = [
              'System.RelatedLinkCount',
              'Custom.ReleaseEffectiveDate',
              'Custom.ReleaseTargetDate',
              'Custom.ReplanningReason',
              'Custom.WorkWeight',
              'Custom.BusinessPriority',
              'System.State',
              'Microsoft.VSTS.Scheduling.CompletedWork',
              'Microsoft.VSTS.Scheduling.OriginalEstimate',
              'Custom.Justificativa',
              'Custom.CompletedWorkTotal',
              'Custom.OriginalEstimateTotal',
              'System.AssignedTo'
            ]

            if ( fields.some(field => args.changedFields.hasOwnProperty(field)) ) {
              validate(WorkItemServices)
            }
          }
        }
      })

      VSS.notifyLoadSucceeded()
    })
  })

})()
