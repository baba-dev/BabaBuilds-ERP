import { prisma } from '@/lib/prisma';

export async function createCommercialActionTask(
  workspaceId: string,
  proposalId: string,
  proposalTitle: string,
  actionType: 'CHASE_PAYMENT' | 'CONVERT_TO_INVOICE' | 'SEND_REMINDER'
) {
  const existingTask = await prisma.task.findFirst({
    where: {
      workspaceId,
      status: 'PENDING',
      OR: [
        { title: { contains: proposalTitle } },
        { description: { contains: proposalId } }
      ]
    }
  });

  if (existingTask) {
    return existingTask; 
  }

  let title = '';
  let description = `Auto-generated commercial workflow task. Origin Proposal ID: ${proposalId}`;
  let dueDate = new Date();

  switch (actionType) {
    case 'CHASE_PAYMENT':
      title = `Collection Follow-up: ${proposalTitle}`;
      break;
    case 'CONVERT_TO_INVOICE':
      title = `Convert Accepted Proposal: ${proposalTitle}`;
      break;
    case 'SEND_REMINDER':
      title = `Follow-Up Unviewed/Stalled: ${proposalTitle}`;
      break;
  }

  return await prisma.task.create({
    data: {
      workspaceId,
      title,
      description,
      dueDate,
      status: 'PENDING'
    }
  });
}
